import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

export function RoadGraph({ data, center }) {
    const { lines, stopSigns, speedBumps, speedBumpTexture } = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return { lines: [], stopSigns: [], speedBumps: [] };
        
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

        if (!xyz.length || !ids.length) return { lines: [], stopSigns: [], speedBumps: [] };
        
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

        // Create Speed Bump Texture
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        // Yellow background
        ctx.fillStyle = '#F1C40F';
        ctx.fillRect(0, 0, 64, 64);
        
        // Black stripes
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        // Draw diagonal stripes
        for (let i = -64; i < 128; i += 16) {
            ctx.moveTo(i, 0);
            ctx.lineTo(i + 16, 64);
            ctx.lineTo(i + 8, 64);
            ctx.lineTo(i - 8, 0);
        }
        ctx.fill();
        
        const texture = new THREE.CanvasTexture(canvas);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        // Adjust repeat based on length if possible, or just a fixed repeat
        texture.repeat.set(1, 1); 

        return { 
            lines: Object.values(segments), 
            stopSigns: stopSignsList, 
            speedBumps: speedBumpsList,
            speedBumpTexture: texture
        };

    }, [data, center]);

    return (
        <group>
            {/* Standard Lines */}
            {lines.map((seg, idx) => {
                const { color, width, opacity, dash, dashSize, gapSize } = getRoadStyle(seg.type);
                return (
                    <Line 
                        key={idx} 
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
                    {/* Note: In Z-up, flat on ground is XY plane. Cylinder default is Y-axis alignment.
                        So Cylinder stands UP (along Z) if we just place it?
                        Default Cylinder aligned to Y.
                        Rotation [PI/2, 0, 0] rotates X-axis: 
                        Y becomes Z.
                        So Cylinder aligned to Z (Up).
                        So the top cap is facing Z (Up). This is correct for Z-up world.
                    */}
                    <cylinderGeometry args={[0.8, 0.8, 0.05, 8]} />
                    <meshBasicMaterial color="#ff0000" />
                </mesh>
            ))}
            
            {/* Speed Bumps (Volumetric Tubes with Stripes) */}
            {speedBumps.map((bump, idx) => {
                 // Create texture if it doesn't exist
                 // We can't easily create a texture inside the map effectively without hooks or global
                 // Better to move texture creation to useMemo above.
                 // But for now, let's use a procedural shader or just a texture created once.
                 
                 // Actually, let's create the texture in the useMemo above to avoid recreating it every render
                 return (
                    <mesh key={idx}>
                        <tubeGeometry args={[bump.curve, 20, 0.3, 8, false]} />
                        <meshStandardMaterial 
                            map={speedBumpTexture}
                            roughness={0.8}
                            metalness={0.1}
                        />
                    </mesh>
                );
            })}
        </group>
    );
}

function getRoadStyle(type) {
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
             return { color: '#888888', width: 4, opacity: 1, dash: false };
        case 16: // Road Edge Median
             return { color: '#AAAAAA', width: 3, opacity: 1, dash: false };
        
        case 18: // Crosswalk (Zebra Pattern style but flatter)
             return { color: '#ffffff', width: 3, opacity: 0.8, dash: true, dashSize: 0.7, gapSize: 0.7 };

        case 3: // Bike Lane
             return { color: '#2ECC71', width: 1.5, opacity: 0.6, dash: true, dashSize: 1, gapSize: 1 };
        
        case 1: case 2: // Lane Centers
             return { color: '#444', width: 1, opacity: 0.2, dash: false };
             
        default: 
             return { color: '#333', width: 1, opacity: 0.3, dash: false };
    }
}
