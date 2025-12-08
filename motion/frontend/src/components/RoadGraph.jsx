import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Crosswalks } from './Crosswalks';

// Standard lane width in meters
const LANE_WIDTH = 3.8;

// Function to generate ribbon geometry (CPU heavy, do once)
function createLaneGeometry(points, width = LANE_WIDTH) {
    if (points.length < 2) return null;

    const curve = new THREE.CatmullRomCurve3(points);
    // Adaptive sampling based on length could be better, but fixed multiplier is okay for now
    const curvePoints = curve.getPoints(points.length * 5); 

    const vertices = [];
    const indices = [];
    const uvs = [];

    for (let i = 0; i < curvePoints.length; i++) {
        const p = curvePoints[i];
        
        // Tangent
        let tangent;
        if (i === 0) {
            tangent = new THREE.Vector3().subVectors(curvePoints[i + 1], p).normalize();
        } else if (i === curvePoints.length - 1) {
            tangent = new THREE.Vector3().subVectors(p, curvePoints[i - 1]).normalize();
        } else {
            tangent = new THREE.Vector3().subVectors(curvePoints[i + 1], curvePoints[i - 1]).normalize();
        }

        // Normal (Width direction)
        const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();

        // Vertices (Flat ribbon, no thickness for merged mesh optimization - usually fine for top-down/remote view)
        // If thickness is needed, we need 2x vertices and sides. 
        // Original LaneRibbon had thickness. Let's keep thickness if possible, but 
        // to save triangles for the huge merge, maybe flat is better? 
        // The original code had `depth = 1.0`.
        // Let's stick to flat for performance first. It looks 99% same from driving view.
        // Actually, without thickness, z-fighting with ground might happen if ground exists. 
        // But here Road IS the ground.
        // Let's add slight poly offset or just flat.
        // Let's do FLAT for now. It drastically reduces vertex count (4x less).
        
        const left = new THREE.Vector3().copy(p).addScaledVector(normal, width / 2);
        const right = new THREE.Vector3().copy(p).addScaledVector(normal, -width / 2);

        vertices.push(left.x, left.y, left.z, right.x, right.y, right.z);
        
        const u = i / (curvePoints.length - 1);
        uvs.push(0, u, 1, u);

        if (i < curvePoints.length - 1) {
            const base = i * 2;
            indices.push(base, base + 1, base + 2);
            indices.push(base + 2, base + 1, base + 3);
        }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();

    return geo;
}

function RoadGraphComponent({ data, center }) {
    const { lanes, markings, stopSigns, speedBumps, crosswalks } = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return { lanes: {}, markings: [], stopSigns: [], speedBumps: [], crosswalks: [] };
        
        // ... (Data extraction logic same as before)
        let map;
        if (Array.isArray(featureMap)) map = new Map(featureMap);
        else map = new Map(Object.entries(featureMap || {}));
        
        const getVal = (key) => {
            const feat = map.get(key);
            if (!feat) return [];
            return feat.floatList?.valueList || feat.int64List?.valueList || [];
        };

        const xyz = getVal('roadgraph_samples/xyz');
        const ids = getVal('roadgraph_samples/id');
        const types = getVal('roadgraph_samples/type'); 
        
        if (!xyz.length || !ids.length) return { lanes: {}, markings: [], stopSigns: [], speedBumps: [], crosswalks: [] };
        
        const segments = {};
        const stopSignsList = [];
        const speedBumpsMap = {}; 

        const [cx, cy, cz] = center;

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const type = types[i];
            const x = xyz[i*3] - cx;
            const y = xyz[i*3+1] - cy;
            const z = xyz[i*3+2] - cz;
            const point = new THREE.Vector3(x, y, z);

            if (type === 17) {
                stopSignsList.push({ pos: point, id });
            } else if (type === 19) {
                if (!speedBumpsMap[id]) speedBumpsMap[id] = [];
                speedBumpsMap[id].push(point);
            } else {
                if (!segments[id]) {
                    segments[id] = { points: [], type: type || 0 };
                }
                segments[id].points.push(point);
            }
        }
        
        const speedBumpsList = Object.values(speedBumpsMap).map(points => {
            if (points.length < 2) return null;
            const curve = new THREE.CatmullRomCurve3(points);
            return { curve, points };
        }).filter(Boolean);

        // Group Lanes by Type for Merging
        // 1: Freeway, 2: Surface, 3: Bike
        const laneGroups = {
            1: [],
            2: [],
            3: []
        };
        const markingSegments = [];
        const crosswalkSegments = [];

        Object.values(segments).forEach(seg => {
            if ([1, 2, 3].includes(seg.type)) {
                laneGroups[seg.type].push(seg.points);
            } else if (seg.type === 18) {
                crosswalkSegments.push(seg);
            } else {
                markingSegments.push(seg);
            }
        });

        return { 
            lanes: laneGroups,
            markings: markingSegments,
            stopSigns: stopSignsList, 
            speedBumps: speedBumpsList,
            crosswalks: crosswalkSegments
        };

    }, [data, center]);

    // Compute Merged Geometries for Lanes
    const mergedLanes = useMemo(() => {
        const results = {};
        
        // Process each lane type
        [1, 2, 3].forEach(type => {
            const pointsList = lanes[type];
            if (!pointsList || pointsList.length === 0) return;

            const geometries = [];
            const style = getLaneStyle(type);

            pointsList.forEach(points => {
                 const geo = createLaneGeometry(points, style.width);
                 if (geo) geometries.push(geo);
            });

            if (geometries.length > 0) {
                // Merge
                const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
                results[type] = {
                    geometry: merged,
                    style: style
                };
            }
        });

        return results;
    }, [lanes]);
    
    // Stop Sign Instance Mesh Logic
    // We use a predefined geometry and verify counts
    const stopSignMesh = useMemo(() => {
        if (stopSigns.length === 0) return null;
        const geom = new THREE.CylinderGeometry(0.8, 0.8, 0.05, 8);
        const mat = new THREE.MeshBasicMaterial({ color: '#ff0000' });
        const mesh = new THREE.InstancedMesh(geom, mat, stopSigns.length);
        
        const dummy = new THREE.Object3D();
        stopSigns.forEach((sign, i) => {
            dummy.position.copy(sign.pos);
            // dummy.rotation.set? signs face traffic? 
            // Waymo data stop signs are points, no orientation usually. 
            // Just flat on ground or on pole? 
            // Original code: rotation [0,0,0], Cylinder flat on ground (y-up).
            // Cylinder default is Y-axis up. So it looks like a puck on the ground? 
            // If it's a pole sign, it should be rotated. 
            // Current vis: Puck on ground (Octagon-ish).
            dummy.updateMatrix();
            mesh.setMatrixAt(i, dummy.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        return mesh;
    }, [stopSigns]);


    return (
        <group>
            {/* Merged Lanes */}
            {Object.entries(mergedLanes).map(([type, { geometry, style }]) => (
                <mesh key={`lane-type-${type}`} geometry={geometry}>
                    <meshStandardMaterial 
                        color={style.color} 
                        transparent={true} 
                        opacity={style.opacity} 
                        side={THREE.DoubleSide}
                        polygonOffset
                        polygonOffsetFactor={1}
                        roughness={0.8}
                        metalness={0.2}
                    />
                </mesh>
            ))}

            {/* Markings (Left as Line for now - tough to merge without custom shader or heavy work) */}
            {markings.map((seg, idx) => {
                const { color, width, opacity, dash, dashSize, gapSize } = getMarkingStyle(seg.type);
                return (
                    <Line 
                        key={`mark-${idx}`} 
                        points={seg.points} 
                        color={color} 
                        lineWidth={width} 
                        transparent
                        opacity={opacity}
                        dashed={dash}
                        dashSize={dashSize}
                        gapSize={gapSize}
                    />
                );
            })}

            {/* Crosswalks */}
            <Crosswalks crosswalks={crosswalks} />

            {/* Stop Signs Instanced */}
            {stopSignMesh && <primitive object={stopSignMesh} />}
            
            {/* Speed Bumps (Keep as tubes, few of them) */}
            {speedBumps.map((bump, idx) => (
                <mesh key={`bump-${idx}`}>
                    <tubeGeometry args={[bump.curve, 20, 0.3, 8, false]} />
                    <meshStandardMaterial color="#FFFF00" roughness={0.6} metalness={0.1} />
                </mesh>
            ))}
        </group>
    );
}

export const RoadGraph = React.memo(RoadGraphComponent);

function getLaneStyle(type) {
    switch(type) {
        case 3: // Bike Lane
            return { color: '#2ECC71', width: 2.0, opacity: 0.6 };
        case 1: // Freeway
        case 2: // Surface Street
        default:
             return { color: '#555555', width: 3.8, opacity: 0.8 };
    }
}

function getMarkingStyle(type) {
    switch(type) {
        case 6: return { color: 'white', width: 2, opacity: 0.8, dash: true, dashSize: 2, gapSize: 1.5 };
        case 7: case 8: return { color: 'white', width: 2, opacity: 1, dash: false };
        case 9: case 10: case 13: return { color: '#F1C40F', width: 2, opacity: 1, dash: true, dashSize: 2, gapSize: 1.5 };
        case 11: case 12: return { color: '#F1C40F', width: 2, opacity: 1, dash: false };
        case 15: return { color: '#000000', width: 6, opacity: 1, dash: false };
        case 16: return { color: '#000000', width: 4, opacity: 1, dash: false };
        default: return { color: '#000000', width: 1, opacity: 0.3, dash: false };
    }
}
