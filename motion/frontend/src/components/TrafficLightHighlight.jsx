import React, { useMemo } from 'react';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export function TrafficLightHighlight({ map, frameRef, center }) {
    // 1. Get SDC Trajectory (Position + Speed)
    const sdcState = useMemo(() => {
        if (!map) return null;

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
    }, [map, center]);

    // 2. Get Traffic Lights Data
    const lightStates = useMemo(() => {
        if (!map) return [];
        
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
    }, [map, center]);

    // 3. Determine Display with Hysteresis
    // State to latch visibility
    // { visible: boolean, causeId: string, color: string }
    const [bubbleState, setBubbleState] = React.useState({ visible: false, causeId: null, color: null, pos: null });
    
    // We use a ref to prevent stale closures in useFrame if we were using state directly, 
    // but here we just need to read data and set state if diff.
    
    // State for throttling
    const throttleRef = React.useRef(0);

    useFrame(() => {
        if (!frameRef || !sdcState) return;
        
        // Throttle logic: Run every 15 frames
        throttleRef.current++;
        if (throttleRef.current % 15 !== 0) return;

        const currentFrameIdx = Math.floor(frameRef.current);
        const sdcPos = sdcState[Math.min(Math.max(0, currentFrameIdx), sdcState.length - 1)];
        const sdcV = sdcPos.speed || 0;

        // If moving fast, bubble should definitely be hidden
        if (sdcV > 0.1) {
            if (bubbleState.visible) {
                setBubbleState({ visible: false, causeId: null, color: null, pos: null });
            }
            return;
        }

        // Red states: 1, 4, 7
        const RED_STATES = [1, 4, 7];
        const GREEN_STATES = [3, 6]; 

        if (bubbleState.visible) {
            // Check ONLY the causing light
            const causeLight = lightStates.find(l => l.id === bubbleState.causeId);
            
            let shouldHide = false;
            
            if (!causeLight) {
                shouldHide = true;
            } else {
                const safeLightFrame = Math.min(Math.max(0, currentFrameIdx), causeLight.states.length - 1);
                let state = causeLight.states[safeLightFrame];
                
                if (GREEN_STATES.includes(state)) {
                    shouldHide = true;
                }
            }
            
            if (shouldHide) {
                 setBubbleState({ visible: false, causeId: null, color: null, pos: null });
            }
            
        } else {
            // Scan for Red lights
            let closestDistSq = Infinity;
            let foundLight = null;

            for (const light of lightStates) {
                const safeLightFrame = Math.min(Math.max(0, currentFrameIdx), light.states.length - 1);
                const state = light.states[safeLightFrame];
                
                // Only trigger on DEFINITIVE Red.
                if (RED_STATES.includes(state)) {
                    const dx = light.pos.x - sdcPos.x;
                    const dy = light.pos.y - sdcPos.y;
                    // Optimization: Use squared distance to avoid Sqrt
                    const distSq = dx*dx + dy*dy;
                    
                    // 40m radius -> 1600
                    if (distSq < 1600 && distSq < closestDistSq) {
                        closestDistSq = distSq;
                        foundLight = light;
                    }
                }
            }
            
            if (foundLight) {
                setBubbleState({ visible: true, causeId: foundLight.id, color: '#ff0000', pos: sdcPos });
            }
        }
    });

    if (!bubbleState.visible || !bubbleState.pos) return null;

    return (
        <BubblePosition pos={bubbleState.pos} color={bubbleState.color} />
    );
}

function BubblePosition({ pos, color }) {
    return (
        <Billboard
            position={[pos.x, pos.y, pos.z + 3.5]}
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
                    <meshBasicMaterial color={color} />
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
        </Billboard>
    );
}
