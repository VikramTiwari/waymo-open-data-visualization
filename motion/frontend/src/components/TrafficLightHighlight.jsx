import React from 'react';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export function TrafficLightHighlight({ sdcState, trafficLights, frameRef }) {
    // 1. SDC State is passed as prop
    // 2. Traffic Lights Data is passed as prop

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
        // SDC State is already {trajectory: [...]} 
        // We need to access trajectory
        const traj = sdcState.trajectory;
        const sdcPos = traj[Math.min(Math.max(0, currentFrameIdx), traj.length - 1)];
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
            const causeLight = trafficLights.find(l => l.id === bubbleState.causeId);
            
            let shouldHide = false;
            
            if (!causeLight) {
                shouldHide = true;
            } else {
                // Light trajectory in parsedTrafficLights is array of objects {state: int}
                const safeLightFrame = Math.min(Math.max(0, currentFrameIdx), causeLight.trajectory.length - 1);
                const step = causeLight.trajectory[safeLightFrame];
                let state = step ? step.state : 0;
                
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

            for (const light of trafficLights) {
                const safeLightFrame = Math.min(Math.max(0, currentFrameIdx), light.trajectory.length - 1);
                const step = light.trajectory[safeLightFrame];
                const state = step ? step.state : 0;
                
                // Only trigger on DEFINITIVE Red.
                if (RED_STATES.includes(state)) {
                    // light has x,y,z
                    const dx = light.x - sdcPos.x;
                    const dy = light.y - sdcPos.y;
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
