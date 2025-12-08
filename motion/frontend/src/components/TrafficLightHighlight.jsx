import React, { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';

export function TrafficLightHighlight({ data, frame, center }) {
    // 1. Get SDC Trajectory (Position + Speed)
    const sdcState = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return null;
        
        let map;
        if (Array.isArray(featureMap)) map = new Map(featureMap);
        else map = new Map(Object.entries(featureMap || {}));

        const getVal = (key) => map.get(key)?.floatList?.valueList || map.get(key)?.int64List?.valueList || [];

        const sdcList = getVal('state/is_sdc');
        let sdcIndex = sdcList.indexOf(Number(1));
        if (sdcIndex === -1) sdcIndex = sdcList.findIndex(v => v == 1);
        if (sdcIndex === -1) return null;

        const count = sdcList.length;

        // Extract Trajectory
        const pastX = getVal('state/past/x'); const pastY = getVal('state/past/y'); const pastZ = getVal('state/past/z');
        const currX = getVal('state/current/x'); const currY = getVal('state/current/y'); const currZ = getVal('state/current/z');
        const futureX = getVal('state/future/x'); const futureY = getVal('state/future/y'); const futureZ = getVal('state/future/z');
        
        const pastSpeed = getVal('state/past/speed');
        const currSpeed = getVal('state/current/speed');
        const futureSpeed = getVal('state/future/speed');

        const pastLen = pastX.length / count;
        const futureLen = futureX.length / count;
        
        const traj = [];
        const [cx, cy, cz] = center;

        // Past
        for (let t = 0; t < pastLen; t++) {
            traj.push({
                x: pastX[sdcIndex * pastLen + t] - cx,
                y: pastY[sdcIndex * pastLen + t] - cy,
                z: pastZ[sdcIndex * pastLen + t] - cz,
                speed: pastSpeed[sdcIndex * pastLen + t]
            });
        }
        // Current
        traj.push({
            x: currX[sdcIndex] - cx,
            y: currY[sdcIndex] - cy,
            z: currZ[sdcIndex] - cz,
            speed: currSpeed[sdcIndex]
        });
        // Future
        for (let t = 0; t < futureLen; t++) {
             traj.push({
                x: futureX[sdcIndex * futureLen + t] - cx,
                y: futureY[sdcIndex * futureLen + t] - cy,
                z: futureZ[sdcIndex * futureLen + t] - cz,
                speed: futureSpeed[sdcIndex * futureLen + t]
            });
        }
        return traj;
    }, [data, center]);

    // 2. Get Traffic Lights Data
    const lightStates = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return [];
        
        let map;
        if (Array.isArray(featureMap)) map = new Map(featureMap);
        else map = new Map(Object.entries(featureMap || {}));
        
        const getVal = (key) => map.get(key)?.floatList?.valueList || map.get(key)?.int64List?.valueList || [];

        const ids = getVal('traffic_light_state/current/id');
        const count = ids.length;
        if (count === 0) return [];
        
        const pastStates = getVal('traffic_light_state/past/state');
        const currStates = getVal('traffic_light_state/current/state');
        const futureStates = getVal('traffic_light_state/future/state');

        // Positions
        const currX = getVal('traffic_light_state/current/x');
        const currY = getVal('traffic_light_state/current/y');
        const currZ = getVal('traffic_light_state/current/z');
        
        const pastLen = pastStates.length / count;
        const futureLen = futureStates.length / count;

        const lights = [];
        const [cx, cy, cz] = center;

        for (let i = 0; i < count; i++) {
            const traj = [];
            // Past
            for (let t = 0; t < pastLen; t++) traj.push(pastStates[i * pastLen + t]);
            // Current
            traj.push(currStates[i]);
            // Future
            for (let t = 0; t < futureLen; t++) traj.push(futureStates[i * futureLen + t]);

            lights.push({
                id: ids[i],
                pos: new THREE.Vector3(currX[i] - cx, currY[i] - cy, currZ[i] - cz), // Lights usually static?
                // Wait, Schema has past/future x/y/z. Lights MIGHT move? (e.g. temporary). But usually static.
                // We'll use current pos for proximity check.
                states: traj
            });
        }
        return lights;
    }, [data, center]);

    if (!sdcState) return null;

    // 3. Determine Display
    const currentFrameIdx = Math.floor(frame);
    // Clamp frame index
    const safeSdcFrame = Math.min(Math.max(0, currentFrameIdx), sdcState.length - 1);
    
    const sdcPos = sdcState[safeSdcFrame];
    const sdcV = sdcPos.speed || 0;
    
    // Check if stopped
    if (sdcV > 0.1) return null; // Moving

    // Find closest RED light
    // Red states: 1, 4, 7
    const RED_STATES = [1, 4, 7];
    
    let closestDist = Infinity;
    let found = false;

    // We assume light list is small enough to iterate
    for (const light of lightStates) {
        // Clamp and Stable State Lookup
        const safeLightFrame = Math.min(Math.max(0, currentFrameIdx), light.states.length - 1);
        let state = light.states[safeLightFrame];
        
        // Anti-flicker: if unknown (0), use previous
        if (state === 0) {
             for (let t = safeLightFrame - 1; t >= 0; t--) {
                 if (light.states[t] !== 0) {
                     state = light.states[t];
                     break;
                 }
             }
        }
        
        if (RED_STATES.includes(state)) {
            // Check distance
            const dx = light.pos.x - sdcPos.x;
            const dy = light.pos.y - sdcPos.y;
            // Z ignored mostly?
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < closestDist) {
                closestDist = dist;
            }
        }
    }
    
    // Threshold: 30 meters? (Intersections can be large)
    if (closestDist < 40) {
        found = true;
    }

    if (!found) return null;

    return (
        <Billboard
            position={[sdcPos.x, sdcPos.y, sdcPos.z + 3.5]} // Above car
            follow={true}
            lockX={false}
            lockY={false}
            lockZ={false}
        >
             <mesh>
                <circleGeometry args={[1.0, 32]} />
                <meshBasicMaterial color="white" transparent opacity={0.9} />
             </mesh>
             {/* Traffic Light Icon */}
             <group scale={0.6}>
                 <mesh position={[0, 0.4, 0.01]}>
                    <circleGeometry args={[0.25, 16]} />
                    <meshBasicMaterial color="#ff0000" />
                 </mesh>
                 <mesh position={[0, 0, 0.01]}>
                    <circleGeometry args={[0.25, 16]} />
                    <meshBasicMaterial color="#333" />
                 </mesh>
                 <mesh position={[0, -0.4, 0.01]}>
                    <circleGeometry args={[0.25, 16]} />
                    <meshBasicMaterial color="#333" />
                 </mesh>
                 {/* Box */}
                 <mesh position={[0, 0, 0]}>
                    <planeGeometry args={[0.8, 1.8]} />
                    <meshBasicMaterial color="black" />
                 </mesh>
             </group>
             
             {/* Text? Check user image. "Traffic Light" + icon. */}
             {/* User image shows just a bubble with icon. */}
        </Billboard>
    );
}
