import React, { useMemo } from 'react';
import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Crosswalks } from './Crosswalks';

// Standard lane width in meters
// Standard lane width in meters
const LANE_WIDTH = 3.8;

// Reusable vectors to avoid GC
const TEMP_VEC1 = new THREE.Vector3();
const TEMP_VEC2 = new THREE.Vector3();
const TEMP_VEC3 = new THREE.Vector3();
const TEMP_VEC4 = new THREE.Vector3();

function createRibbonGeometry(points, width, isDashed = false, dashSize = 2, gapSize = 1.5, zOffset = 0) {
    if (points.length < 2) return null;

    const vertices = [];
    const indices = []; // Uint16 or Uint32? Standard JS array fine for Three
    const uvs = [];

    // Helper to add a quad
    // p1, p2 are center points
    // width is total width
    const addQuad = (p1, p2, w) => {
        // TEMP_VEC1: Tangent
        TEMP_VEC1.subVectors(p2, p1).normalize();
        // TEMP_VEC2: Normal (-y, x)
        TEMP_VEC2.set(-TEMP_VEC1.y, TEMP_VEC1.x, 0).normalize();
        
        // Vertices
        // TL (0), TR (1), BL (2), BR (3) relative to segment
        // 0: P1 + Left
        // 1: P1 - Left (Right)
        // 2: P2 + Left
        // 3: P2 - Left (Right)
        
        const dx = TEMP_VEC2.x * w / 2;
        const dy = TEMP_VEC2.y * w / 2;

        const baseIdx = vertices.length / 3;

        // P1 Left
        vertices.push(p1.x + dx, p1.y + dy, p1.z + zOffset);
        // P1 Right 
        vertices.push(p1.x - dx, p1.y - dy, p1.z + zOffset);
        // P2 Left
        vertices.push(p2.x + dx, p2.y + dy, p2.z + zOffset);
        // P2 Right
        vertices.push(p2.x - dx, p2.y - dy, p2.z + zOffset);

        // UVs (Simple 0-1)
        uvs.push(0, 0);
        uvs.push(1, 0);
        uvs.push(0, 1);
        uvs.push(1, 1);

        // Indices: 0, 2, 1 and 1, 2, 3
        indices.push(baseIdx, baseIdx + 2, baseIdx + 1);
        indices.push(baseIdx + 1, baseIdx + 2, baseIdx + 3);
    };

    if (isDashed) {
        let currentDist = 0;
        
        for (let i = 0; i < points.length - 1; i++) {
            const p1 = points[i];
            const p2 = points[i+1];
            const segLen = p1.distanceTo(p2);
            
            let distOnSeg = 0;
            
            while (distOnSeg < segLen) {
                const globalDist = currentDist;
                const cyclePos = globalDist % (dashSize + gapSize);
                
                if (cyclePos < dashSize) {
                    // Draw mode
                    const remainingDash = dashSize - cyclePos;
                    const remainingSeg = segLen - distOnSeg;
                    const drawLen = Math.min(remainingDash, remainingSeg);
                    
                    const startT = distOnSeg / segLen;
                    const endT = (distOnSeg + drawLen) / segLen;
                    
                    // Use TEMP_VEC3 and TEMP_VEC4 for startP and endP
                    // NOTE: addQuad uses VEC1/VEC2 internally, so VEC3/VEC4 are safe to pass as args
                    TEMP_VEC3.lerpVectors(p1, p2, startT);
                    TEMP_VEC4.lerpVectors(p1, p2, endT);
                    
                    addQuad(TEMP_VEC3, TEMP_VEC4, width);
                    
                    currentDist += drawLen;
                    distOnSeg += drawLen;
                } else {
                    // Gap mode
                    const remainingGap = (dashSize + gapSize) - cyclePos;
                    const remainingSeg = segLen - distOnSeg;
                    const skipLen = Math.min(remainingGap, remainingSeg);
                    
                    currentDist += skipLen;
                    distOnSeg += skipLen;
                }
            }
        }
    } else {
        // Solid Strip - Continuous Mesh
        // This is slightly better than quads if we want smooth joins, 
        // but for road ribbons, simple quads usually suffice or "strip" logic.
        // Let's use the strip logic for solid to match previous behavior 
        // (createSingleStrip function was doing this). 
        // But we want to inline it or use the same buffer logic.
        
        // Re-implement solid strip logic here to return similar structure
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            
            // Calculate tangent into TEMP_VEC1
            if (i === 0) {
                TEMP_VEC1.subVectors(points[i + 1], p).normalize();
            } else if (i === points.length - 1) {
                TEMP_VEC1.subVectors(p, points[i - 1]).normalize();
            } else {
                TEMP_VEC1.subVectors(points[i + 1], points[i - 1]).normalize();
            }

            // Normal into TEMP_VEC2
            TEMP_VEC2.set(-TEMP_VEC1.y, TEMP_VEC1.x, 0).normalize();
            const dx = TEMP_VEC2.x * width / 2;
            const dy = TEMP_VEC2.y * width / 2;

            vertices.push(p.x + dx, p.y + dy, p.z + zOffset); // Left
            vertices.push(p.x - dx, p.y - dy, p.z + zOffset); // Right
            
            uvs.push(0, 0);
            uvs.push(1, 0);

            if (i < points.length - 1) {
                const base = i * 2;
                indices.push(base, base + 2, base + 1);
                indices.push(base + 1, base + 2, base + 3);
            }
        }
    }

    if (vertices.length === 0) return null;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    
    return geo;
}




function RoadGraphComponent({ map, center }) {
    const { lanes, markings, stopSigns, speedBumps, crosswalks } = useMemo(() => {
        if (!map) return { lanes: {}, markings: [], stopSigns: [], speedBumps: [], crosswalks: [] };
        
        const getVal = (key) => {
            const feat = map.get(key);
            if (!feat) return [];
            return feat.floatList?.valueList || feat.int64List?.valueList || [];
        };

        const xyz = getVal('roadgraph_samples/xyz');
        const ids = getVal('roadgraph_samples/id');
        const types = getVal('roadgraph_samples/type'); 
        const dirs = getVal('roadgraph_samples/dir');

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
                let dir = null;
                // dir should correspond to the point
                if (dirs && dirs.length > i * 3 + 2) {
                    dir = new THREE.Vector3(dirs[i*3], dirs[i*3+1], dirs[i*3+2]);
                }
                stopSignsList.push({ pos: point, id, dir });
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
        
        // Speed Bumps - Use raw points too if we want, but curves are okay for rare items.
        // Actually, let's keep curve for speedbumps (rare) or remove? 
        // Let's remove curve dependency completely for consistence.
        // Pre-calculate speed bump geometries
        const speedBumpsList = Object.values(speedBumpsMap).map(points => {
            if (points.length < 2) return null;
            // Bumps slightly elevated
            const geo = createRibbonGeometry(points, 0.4, false, 0, 0, 0.05);
            if (!geo) return null;
            return { geometry: geo };
        }).filter(Boolean);

        const laneGroups = { 1: [], 2: [], 3: [] };
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

    }, [map, center]);

    // --- MERGE LANES ---
    const mergedLanes = useMemo(() => {
        const results = {};
        [1, 2, 3].forEach(type => {
            const pointsList = lanes[type];
            if (!pointsList || pointsList.length === 0) return;

            const geometries = [];
            const style = getLaneStyle(type);

            pointsList.forEach(points => {
                 // Lanes at Z=0 relative to road surface
                 const geo = createRibbonGeometry(points, style.width, false, 0, 0, 0);
                 if (geo) geometries.push(geo);
            });

            if (geometries.length > 0) {
                const merged = BufferGeometryUtils.mergeGeometries(geometries, false);
                results[type] = {
                    geometry: merged,
                    style: style
                };
            }
        });
        return results;
    }, [lanes]);
    
    // --- MERGE MARKINGS ---
    const mergedMarkings = useMemo(() => {
        // Group by style key
        const groups = {};
        
        // Define style key helper
        const getStyleKey = (s) => `${s.color}-${s.width}-${s.dash}-${s.dashSize}-${s.gapSize}`;

        markings.forEach(seg => {
            const style = getMarkingStyle(seg.type);
            const key = getStyleKey(style);
            if (!groups[key]) groups[key] = { style, geometries: [] };
            
            // Convert pixel width to meters approximate
            // 1px approx 0.1m, 2 -> 0.15m, 4 -> 0.3m, 6 -> 0.5m
            let meterWidth = 0.1;
            if (style.width >= 6) meterWidth = 0.5;
            else if (style.width >= 4) meterWidth = 0.3;
            else if (style.width >= 2) meterWidth = 0.15;
            
            // Markings slightly elevated +0.02
            const geo = createRibbonGeometry(seg.points, meterWidth, style.dash, style.dashSize, style.gapSize, 0.02);
            if (geo) groups[key].geometries.push(geo);
        });
        
        const results = [];
        Object.values(groups).forEach(g => {
            if (g.geometries.length > 0) {
                const merged = BufferGeometryUtils.mergeGeometries(g.geometries, false);
                results.push({ geometry: merged, style: g.style });
            }
        });
        
        return results;
    }, [markings]);


    // --- STOP SIGNS ---
    const stopSignMesh = useMemo(() => {
        if (stopSigns.length === 0) return null;

        // 1. Create Pole Geometry
        // Vertical Cylinder. Radius 0.05m, Height 2.2m.
        // Base at 0, Top at 2.2.
        // CylinderGeometry(0.05, 0.05, 2.2) default center at (0,0,0) (so -1.1 to 1.1)
        // Rotate X 90 -> Vertical (Z-up).
        // Translate Z +1.1 -> Base at 0, Top at 2.2.
        // 1. Create Pole Geometry
        // Vertical Cylinder. Radius 0.05m, Height 3m.
        // Assumes data point is at the sign (elevated). Extend pole down.
        // Rotate X 90 -> Vertical (Z-up).
        // Range [-1.5, 1.5] -> Translate Z -1.5 -> [-3.0, 0]
        const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 3.0, 8);
        poleGeo.rotateX(Math.PI / 2);
        poleGeo.translate(0, 0, -1.5);

        // 2. Create Sign Geometry (Octagon)
        // Position at Z=0 (The data point)
        const signGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.05, 8);
        signGeo.rotateZ(Math.PI / 2);
        // signGeo.translate(0, 0, 0); // Centered at data point

        // 3. Merge geometries with groups
        const mergedGeo = BufferGeometryUtils.mergeGeometries([poleGeo, signGeo], false);
        
        // Add groups
        mergedGeo.clearGroups();
        // Use indices count
        const poleIndexCount = poleGeo.index.count;
        const signIndexCount = signGeo.index.count;

        mergedGeo.addGroup(0, poleIndexCount, 0);
        mergedGeo.addGroup(poleIndexCount, signIndexCount, 1); // Material 1 (Sign)

        // Materials
        const poleMat = new THREE.MeshStandardMaterial({ color: '#888888', roughness: 0.8 });
        const signMat = new THREE.MeshBasicMaterial({ color: '#ff0000' }); // Basic for bright red

        const mesh = new THREE.InstancedMesh(mergedGeo, [poleMat, signMat], stopSigns.length);
        
        const dummy = new THREE.Object3D();

        stopSigns.forEach((sign, i) => {
            dummy.position.copy(sign.pos);

            // Orientation
            if (sign.dir) {
                // Calculate Yaw from dir
                const yaw = Math.atan2(sign.dir.y, sign.dir.x);
                // Rotate around Z axis (which is up)
                dummy.rotation.set(0, 0, yaw);
            } else {
                dummy.rotation.set(0, 0, 0);
            }

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
                        polygonOffsetFactor={4}
                        depthWrite={false} // Prevent Z-fighting on overlaps
                        roughness={0.8}
                        metalness={0.2}
                    />
                </mesh>
            ))}

            {/* Merged Markings */}
            {mergedMarkings.map((group, idx) => (
                 <mesh key={`mark-group-${idx}`} geometry={group.geometry} renderOrder={1}>
                     <meshStandardMaterial 
                        color={group.style.color} 
                        transparent={true}
                        opacity={group.style.opacity}
                        side={THREE.DoubleSide}
                        polygonOffset
                        polygonOffsetFactor={2} // Markings (2) vs Lanes (4)
                        roughness={0.5}
                        metalness={0.1}
                    />
                 </mesh>
            ))}

            <Crosswalks crosswalks={crosswalks} />

            {stopSignMesh && <primitive object={stopSignMesh} />}
            
            {speedBumps.map((bump, idx) => (
                <mesh key={`bump-${idx}`} geometry={bump.geometry}>
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
            return { color: '#145A32', width: 2.0, opacity: 0.4 };
        case 1: // Freeway
        case 2: // Surface Street
        default:
             return { color: '#555555', width: 3.8, opacity: 0.8 };
    }
}

function getMarkingStyle(type) {
    switch(type) {
        case 6: // Dashed
            return { color: 'white', width: 2, opacity: 0.8, dash: true, dashSize: 2, gapSize: 3 }; 
        case 7: case 8: // Solid
            return { color: 'white', width: 2, opacity: 1, dash: false };
        case 9: case 10: case 13: // Yellow Dashed
            return { color: '#F1C40F', width: 2, opacity: 1, dash: true, dashSize: 2, gapSize: 3 };
        case 11: case 12: // Yellow Solid
            return { color: '#F1C40F', width: 2, opacity: 1, dash: false };
        case 15: // Stop line
            return { color: '#ffffff', width: 6, opacity: 1, dash: false };
        case 16: 
            return { color: '#ffffff', width: 4, opacity: 1, dash: false };
        default: 
            return { color: '#ffffff', width: 1, opacity: 0.3, dash: false };
    }
}
