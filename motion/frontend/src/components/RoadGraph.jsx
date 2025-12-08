import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { Crosswalks } from './Crosswalks';

// Standard lane width in meters (approx 12ft)
const LANE_WIDTH = 3.8;

// LaneRibbon component to render a flat ribbon on the ground
const LaneRibbon = React.memo(({ points, width = LANE_WIDTH, color = '#555555', opacity = 0.8, depth = 0.5 }) => {
    const geometry = useMemo(() => {
        if (points.length < 2) return null;

        // Create a curve from points
        const curve = new THREE.CatmullRomCurve3(points);
        // Getting more points for smoothness
        const curvePoints = curve.getPoints(points.length * 5); 

        const vertices = [];
        const indices = [];
        const uvs = [];

        // For each point, calculate left and right positions
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
            // This normal gives us the "width" direction
            // Rotate tangent 90 degrees around Z axis: (-y, x, 0)
            const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();

            // Calculate "Up" vector for the slab thickness
            // We want thickness to be perpendicular to the road surface
            // The road surface normal is Cross(tangent, normal)
            const up = new THREE.Vector3().crossVectors(tangent, normal).normalize();
            // Ensure up is generally pointing positive Z
            if (up.z < 0) up.negate();

            // Top surface vertices
            const leftTop = new THREE.Vector3().copy(p).addScaledVector(normal, width / 2);
            const rightTop = new THREE.Vector3().copy(p).addScaledVector(normal, -width / 2);
            
            // Bottom surface vertices (offset by depth/thickness)
            // We subtract depth * up vector
            const leftBottom = new THREE.Vector3().copy(leftTop).addScaledVector(up, -depth);
            const rightBottom = new THREE.Vector3().copy(rightTop).addScaledVector(up, -depth);

            // Add vertices for this slice
            // We need multiple vertices per position to have sharp edges (normals need to be different)
            // But for a smooth ribbon we might share them.
            // However, to get a boxy look, we need distinct faces.
            // For one continuous mesh, we can just push 4 points per slice?
            // Wait, for flat shading or sharp edges, we need separate vertices or we need to be careful with normals.
            // Given we are using computeVertexNormals(), if we share vertices, it will smooth the edges.
            // We want the top to be smooth along the curve, but the edge between top and side to be sharp.
            // This requires duplicating vertices or using groups.
            // Simplest approach for "slab" with sharp edges: 
            // 3 separate geometries (Top, Bottom, Sides) merged? 
            // Or just one geometry with split vertices.
            
            // To keep it simple and performant enough: 
            // We'll generate a "cylinder-like" structure but with hard edges.
            
            // Actually, let's just make it one smooth mesh for now, but focus on the shape.
            // If it looks too round, we can split it.
            // Let's try shared vertices first, it's efficient.
            
            // Vertex layout per slice: 0:LT, 1:RT, 2:LB, 3:RB
            vertices.push(
                leftTop.x, leftTop.y, leftTop.z,        // 0
                rightTop.x, rightTop.y, rightTop.z,     // 1
                leftBottom.x, leftBottom.y, leftBottom.z, // 2
                rightBottom.x, rightBottom.y, rightBottom.z // 3
            );

            // UVs
            const u = i / (curvePoints.length - 1);
            uvs.push(0, u, 1, u, 0, u, 1, u); // Simplified UVs for bottom too

            // Indices
            if (i < curvePoints.length - 1) {
                const base = i * 4;
                const nextBase = (i + 1) * 4;

                // Top Face (LT, RT, NextLT, NextRT) -> (0, 1, 4, 5)
                indices.push(base + 0, base + 1, nextBase + 0);
                indices.push(nextBase + 0, base + 1, nextBase + 1);

                // Bottom Face (LB, RB, NextLB, NextRB) -> (2, 3, 6, 7)
                // Winding order reversed so it faces down
                indices.push(base + 2, nextBase + 2, base + 3);
                indices.push(base + 3, nextBase + 2, nextBase + 3);

                // Left Side Face (LT, LB, NextLT, NextLB) -> (0, 2, 4, 6)
                indices.push(base + 0, nextBase + 0, base + 2);
                indices.push(base + 2, nextBase + 0, nextBase + 2);

                // Right Side Face (RT, RB, NextRT, NextRB) -> (1, 3, 5, 7)
                indices.push(base + 1, base + 3, nextBase + 1);
                indices.push(nextBase + 1, base + 3, nextBase + 3);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        
        // Improve appearance by splitting vertices to get flat shading on sides?
        // computeVertexNormals will smooth everything.
        // For distinct "slab" look, we really should have used separate vertices for Top vs Side.
        // But let's see how it looks. If it looks like a tube, we fix it.
        geo.computeVertexNormals();

        return geo;
    }, [points, width, depth]);

    if (!geometry) return null;

    return (
        <mesh geometry={geometry}>
            <meshStandardMaterial 
                color={color} 
                transparent={true} 
                opacity={opacity} 
                side={THREE.DoubleSide}
                polygonOffset
                polygonOffsetFactor={1}
                roughness={0.8}
                metalness={0.2}
            />
        </mesh>
    );
});


function RoadGraphComponent({ data, center }) {
    const { lanes, markings, stopSigns, speedBumps, crosswalks } = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return { lanes: [], markings: [], stopSigns: [], speedBumps: [], crosswalks: [] };
        
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
        
        if (!xyz.length || !ids.length) return { lanes: [], markings: [], stopSigns: [], speedBumps: [], crosswalks: [] };
        
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

        // Separate Lanes (Type 1, 2, 3), Crosswalks (Type 18), and Markings (Lines)
        const allSegments = Object.values(segments);
        const laneSegments = [];
        const markingSegments = [];
        const crosswalkSegments = [];

        allSegments.forEach(seg => {
            // Type 1: Lane Center (Freeway)
            // Type 2: Lane Center (Surface Street)
            // Type 3: Bike Lane
            if ([1, 2, 3].includes(seg.type)) {
                laneSegments.push(seg);
            } else if (seg.type === 18) { // Crosswalk
                crosswalkSegments.push(seg);
            } else {
                markingSegments.push(seg);
            }
        });

        return { 
            lanes: laneSegments,
            markings: markingSegments,
            stopSigns: stopSignsList, 
            speedBumps: speedBumpsList,
            crosswalks: crosswalkSegments
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
                        depth={1.0} // Thickness of the road slab
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

            {/* Crosswalks (Custom Zebra Shader) */}
            <Crosswalks crosswalks={crosswalks} />

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
        
        // Type 18 (Crosswalk) is now handled by dedicated component, 
        // but if any slip through or for fallback:
        // case 18:
        //      return { color: '#ffffff', width: 3, opacity: 0.8, dash: true, dashSize: 0.7, gapSize: 0.7 };
             
        default: 
             return { color: '#000000', width: 1, opacity: 0.3, dash: false };
    }
}
