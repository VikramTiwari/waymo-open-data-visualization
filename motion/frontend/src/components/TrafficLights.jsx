import React, { useMemo, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const TEMP_OBJECT = new THREE.Object3D();
const TEMP_COLOR = new THREE.Color();

export function TrafficLights({ data, frameRef, center }) {
    const trafficLights = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return [];
        
        let map;
        if (Array.isArray(featureMap)) {
            // Check if it's already an array of [k, v] or objects
            // The output of pruneData might be object, but input parsing here needs to be robust
            if (featureMap.length > 0 && Array.isArray(featureMap[0])) {
                 map = new Map(featureMap);
            } else if (featureMap.length > 0 && typeof featureMap[0] === 'object') {
                 // Array of objects {key, value}
                 map = new Map(featureMap.map(e => [e.key, e.value]));
            } else {
                 map = new Map(); // Empty or unknown
            }
        } else {
             // It is an Object (from our pruned data)
             map = new Map(Object.entries(featureMap || {}));
        }

        const getVal = (key) => { 
            const feat = map.get(key);
            if (!feat) return [];
            return feat.floatList?.valueList || feat.int64List?.valueList || [];
        };
        
        const ids = getVal('traffic_light_state/current/id');
        const count = ids.length;
        if (count === 0) return [];

        const currentStates = getVal('traffic_light_state/current/state');
        const currentX = getVal('traffic_light_state/current/x');
        const currentY = getVal('traffic_light_state/current/y');
        const currentZ = getVal('traffic_light_state/current/z');
        const currentValid = getVal('traffic_light_state/current/valid');
        
        const pastStates = getVal('traffic_light_state/past/state');
        const pastValid = getVal('traffic_light_state/past/valid');
        
        const futureStates = getVal('traffic_light_state/future/state');
        const futureValid = getVal('traffic_light_state/future/valid');
        
        const pastLen = pastStates.length > 0 ? (pastStates.length / count) : 0;
        const futureLen = futureStates.length > 0 ? (futureStates.length / count) : 0;
        
        const [cx, cy, cz] = center;

        const parsedLights = [];
        
        for (let i = 0; i < count; i++) {
            // If current is invalid, should we skip?
            // Usually valid=1 means valid.
            if (currentValid && currentValid[i] === 0) continue;

            const trajectory = [];
            
            // Past
            for (let t = 0; t < pastLen; t++) {
                const idx = i * pastLen + t;
                // Check validity if available
                 if (pastValid && pastValid[idx] === 0) {
                     trajectory.push(null);
                     continue;
                 }
                trajectory.push({
                    state: pastStates[idx],
                    // We assume static position for lights, so we use current XYZ for all frames?
                    // Or do we actually have past XYZ?
                    // Schema *has* past/x/y/z in whitelist.
                    // But in this specific component logic, previous version used pastX/Y/Z.
                    // Let's stick to using current pos for static lights to save memory/perf if they don't move.
                    // But wait, previous code read pastX...
                    // Let's assume static. It's safer for perf and usually true.
                    // If we need moving lights, we can add it back.
                });
            }
            
            // Current
            trajectory.push({
                state: currentStates[i]
            });
            
            // Future
            for (let t = 0; t < futureLen; t++) {
                const idx = i * futureLen + t;
                if (futureValid && futureValid[idx] === 0) {
                     trajectory.push(null);
                     continue;
                 }
                trajectory.push({
                    state: futureStates[idx]
                });
            }
            
            // Position
            const x = (currentX[i] || 0) - cx;
            const y = (currentY[i] || 0) - cy;
            const z = (currentZ[i] || 0) - cz;

            parsedLights.push({
                id: ids[i],
                x, y, z,
                trajectory
            });
        }
        
        // Dedup / Cluster
        const uniqueLights = [];
        const seenPos = [];
        
        for (const light of parsedLights) {
            let duplicate = false;
            for (const sp of seenPos) {
                const dx = sp.x - light.x;
                const dy = sp.y - light.y;
                const dz = sp.z - light.z;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (dist < 0.2) { 
                    duplicate = true;
                    break;
                }
            }
            
            if (!duplicate) {
                uniqueLights.push(light);
                seenPos.push({ x: light.x, y: light.y, z: light.z });
            }
        }
        
        return uniqueLights;
    }, [data, center]);

    const casingRef = useRef();
    const bulbRef = useRef();

    // Initial Setup (Matrices)
    useEffect(() => {
        if (!casingRef.current || !bulbRef.current || trafficLights.length === 0) return;

        trafficLights.forEach((light, i) => {
            TEMP_OBJECT.position.set(light.x, light.y, light.z);
            TEMP_OBJECT.rotation.set(0, 0, 0); // Todo: Yaw? Lights usually have orientation.
            // Current schema has traffic_light_state/current/x,y,z but NO quantization of yaw/axis in this list?
            // "state/current/bbox_yaw" is for agents.
            // Traffic lights in Waymo are usually point features with state. 
            // Orientation might be in roadgraph/samples or implicit?
            // Previous code didn't rotate them.
            TEMP_OBJECT.scale.set(1, 1, 1);
            TEMP_OBJECT.updateMatrix();

            casingRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
            bulbRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
        });
        
        casingRef.current.instanceMatrix.needsUpdate = true;
        bulbRef.current.instanceMatrix.needsUpdate = true;
    }, [trafficLights]);

    useFrame(() => {
        if (!frameRef || !bulbRef.current || trafficLights.length === 0) return;

        const currentFrame = frameRef.current;
        
        trafficLights.forEach((light, i) => {
            const traj = light.trajectory;
            const idx = Math.min(Math.floor(currentFrame), traj.length - 1);
            const step = traj[idx];

            if (step) {
                const colorHex = getStateColor(step.state);
                TEMP_COLOR.set(colorHex);
            } else {
                TEMP_COLOR.set('#808080'); // Gray/Off
            }
            bulbRef.current.setColorAt(i, TEMP_COLOR);
        });
        
        bulbRef.current.instanceColor.needsUpdate = true;
    });

    return (
        <group>
            {/* Casing Instances */}
            {trafficLights.length > 0 && (
                <instancedMesh ref={casingRef} args={[null, null, trafficLights.length]}>
                    <boxGeometry args={[0.5, 0.5, 1.2]} />
                    <meshStandardMaterial color="#222" />
                </instancedMesh>
            )}
            
            {/* Bulb Instances */}
            {trafficLights.length > 0 && (
                <instancedMesh ref={bulbRef} args={[null, null, trafficLights.length]}>
                     <sphereGeometry args={[0.3, 16, 16]} />
                     <meshBasicMaterial toneMapped={false} />
                </instancedMesh>
            )}
        </group>
    );
}

function getStateColor(state) {
    switch (state) {
        case 1: // Arrow Stop (Red)
        case 4: // Stop (Red)
        case 7: // Flashing Stop (Red)
            return '#ff0000';
        case 2: // Arrow Caution (Yellow)
        case 5: // Caution (Yellow)
        case 8: // Flashing Caution (Yellow)
            return '#ffff00';
        case 3: // Arrow Go (Green)
        case 6: // Go (Green)
            return '#00ff00';
        case 0: // Unknown
        default:
            return '#808080'; // Gray
    }
}
