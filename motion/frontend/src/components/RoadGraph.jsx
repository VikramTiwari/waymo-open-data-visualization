import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

// Standard lane width in meters (approx 12ft)
const LANE_WIDTH = 3.8;

// LaneRibbon component to render a flat ribbon on the ground
const LaneRibbon = React.memo(({ points, width = LANE_WIDTH, color = '#555555', opacity = 0.8 }) => {
    const geometry = useMemo(() => {
        if (points.length < 2) return null;

        // Create a curve from points
        const curve = new THREE.CatmullRomCurve3(points);
        // Getting more points for smoothness
        const curvePoints = curve.getPoints(points.length * 5); 

        const vertices = [];
        const indices = [];
        const uvs = [];

        // For each point, calculate left and right positions based on tangent
        for (let i = 0; i < curvePoints.length; i++) {
            const p = curvePoints[i];
            
            // Calculate tangent
            let tangent;
            if (i === 0) {
                tangent = new THREE.Vector3().subVectors(curvePoints[i + 1], p).normalize();
            } else if (i === curvePoints.length - 1) {
                tangent = new THREE.Vector3().subVectors(p, curvePoints[i - 1]).normalize();
            } else {
                tangent = new THREE.Vector3().subVectors(curvePoints[i + 1], curvePoints[i - 1]).normalize();
            }

            // Calculate normal (perpendicular to tangent on XY plane - Z up)
            // Rotate tangent 90 degrees around Z axis: (-y, x, 0)
            const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();

            // Left and Right vertices
            const left = new THREE.Vector3().copy(p).addScaledVector(normal, width / 2);
            const right = new THREE.Vector3().copy(p).addScaledVector(normal, -width / 2);

            // Add vertices
            vertices.push(left.x, left.y, left.z); // Even indices (0, 2, 4...)
            vertices.push(right.x, right.y, right.z); // Odd indices (1, 3, 5...)

            // UVs (simple mapping along length)
            const u = i / (curvePoints.length - 1);
            uvs.push(0, u);
            uvs.push(1, u);

            // Indices
            if (i < curvePoints.length - 1) {
                const base = i * 2;
                // Two triangles for the quad
                // 0, 1, 2 (Left Current, Right Current, Left Next)
                indices.push(base, base + 1, base + 2);
                // 2, 1, 3 (Left Next, Right Current, Right Next)
                indices.push(base + 2, base + 1, base + 3);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        return geo;
    }, [points, width]);

    if (!geometry) return null;

    return (
        <mesh geometry={geometry}>
            <meshStandardMaterial 
                color={color} 
                transparent={true} 
                opacity={opacity} 
                side={THREE.DoubleSide}
                polygonOffset
                polygonOffsetFactor={1} // Push back slightly to let markings render on top
            />
        </mesh>
    );
});


function RoadGraphComponent({ data, center }) {
    const { lanes, markings, stopSigns, speedBumps } = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return { lanes: [], markings: [], stopSigns: [], speedBumps: [] };
        
        let map;
        if (Array.isArray(featureMap)) {
            map = new Map(featureMap);
        } else {
             map = new Map(Object.entries(featureMap || {}));
        }
        
        // Helper to get values
        const getVal = (key) => {
            const feat = map.get(key);
            if (!feat) {
                return [];
            }
            return feat.floatList?.valueList || feat.int64List?.valueList || [];
        };

        const xyz = getVal('roadgraph_samples/xyz');
        const ids = getVal('roadgraph_samples/id');
        const types = getVal('roadgraph_samples/type'); 
        
        if (!xyz.length || !ids.length) return { lanes: [], markings: [], stopSigns: [], speedBumps: [] };
        
        const segments = {};
        const stopSignsList = [];
        const speedBumpsMap = {}; // Group points by ID for curves

        const [cx, cy, cz] = center;

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const type = types[i];
            const x = xyz[i*3] - cx;
            const y = xyz[i*3+1] - cy;
            const z = xyz[i*3+2] - cz;
            const point = new THREE.Vector3(x, y, z);

            if (type === 17) {
                // Stop Sign
                stopSignsList.push({ pos: point, id });
            } else if (type === 19) {
                // Speed Bump
                if (!speedBumpsMap[id]) speedBumpsMap[id] = [];
                speedBumpsMap[id].push(point);
            } else {
                if (!segments[id]) {
                    segments[id] = { points: [], type: type || 0 };
                }
                segments[id].points.push(point);
            }
        }
        
        // Process Speed Bumps into Curves
        const speedBumpsList = Object.values(speedBumpsMap).map(points => {
            if (points.length < 2) return null;
            const curve = new THREE.CatmullRomCurve3(points);
            return { curve, points };
        }).filter(Boolean);

        // Separate Lanes (Type 1, 2, 3) from Markings (Lines)
        const allSegments = Object.values(segments);
        const laneSegments = [];
        const markingSegments = [];

        allSegments.forEach(seg => {
            // Type 1: Lane Center (Freeway)
            // Type 2: Lane Center (Surface Street)
            // Type 3: Bike Lane
            if ([1, 2, 3].includes(seg.type)) {
                laneSegments.push(seg);
            } else {
                markingSegments.push(seg);
            }
        });

        return { 
            lanes: laneSegments,
            markings: markingSegments,
            stopSigns: stopSignsList, 
            speedBumps: speedBumpsList
        };

    }, [data, center]);

    return (
        <group>
            {/* Driveable Lanes (Ribbons) */}
            {lanes.map((seg, idx) => {
                const style = getLaneStyle(seg.type);
                return (
                    <LaneRibbon 
                        key={`lane-${idx}`} 
                        points={seg.points} 
                        width={style.width}
                        color={style.color}
                        opacity={style.opacity}
                    />
                );
            })}

            {/* Road Markings (Lines) */}
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

            {/* Distinct Stop Signs (Flat Octagons) */}
            {stopSigns.map((sign, idx) => (
                <mesh key={`${sign.id}-${idx}`} position={sign.pos} rotation={[0, 0, 0]}> 
                    <cylinderGeometry args={[0.8, 0.8, 0.05, 8]} />
                    <meshBasicMaterial color="#ff0000" />
                </mesh>
            ))}
            
            {/* Speed Bumps (Volumetric Tubes - Solid Bright Yellow) */}
            {speedBumps.map((bump, idx) => {
                 return (
                    <mesh key={idx}>
                        <tubeGeometry args={[bump.curve, 20, 0.3, 8, false]} />
                        <meshStandardMaterial 
                            color="#FFFF00" // Bright Yellow
                            roughness={0.6}
                            metalness={0.1}
                        />
                    </mesh>
                );
            })}
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
    // Waymo road types
    switch(type) {
        case 6: // Broken White
             return { color: 'white', width: 2, opacity: 0.8, dash: true, dashSize: 2, gapSize: 1.5 };
        case 7: case 8: // Solid White
             return { color: 'white', width: 2, opacity: 1, dash: false };
        case 9: case 10: case 13: // Broken Yellow
             return { color: '#F1C40F', width: 2, opacity: 1, dash: true, dashSize: 2, gapSize: 1.5 };
        case 11: case 12: // Solid Yellow
             return { color: '#F1C40F', width: 2, opacity: 1, dash: false };
        
        case 15: // Road Edge Boundary
             return { color: '#000000', width: 6, opacity: 1, dash: false };
        case 16: // Road Edge Median
             return { color: '#000000', width: 4, opacity: 1, dash: false };
        
        case 18: // Crosswalk (Zebra Pattern style but flatter)
             return { color: '#ffffff', width: 3, opacity: 0.8, dash: true, dashSize: 0.7, gapSize: 0.7 };
             
        default: 
             return { color: '#000000', width: 1, opacity: 0.3, dash: false };
    }
}
