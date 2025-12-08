import React from 'react';
import { Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export function TrafficLightHighlight({ sdcState, trafficLights, frameRef }) {
    const groupRef = React.useRef();
    const visibleRef = React.useRef(false);
    const lastSeenFrameRef = React.useRef(-100);

    useFrame(() => {
        if (!frameRef || !sdcState || !groupRef.current) return;
        
        const currentFrameIdx = Math.floor(frameRef.current);
        const traj = sdcState.trajectory;
        // Clamp frame
        const idx = Math.min(Math.max(0, currentFrameIdx), traj.length - 1);
        const sdcPos = traj[idx];
        const sdcV = sdcPos.speed || 0;

        // 1. Position: ALWAYS follow the car roof
        groupRef.current.position.set(sdcPos.x, sdcPos.y, sdcPos.z + 2.2);
        
        // 2. Logic: Hysteresis + Debounce
        
        // Speed Hysteresis
        let speedCondition = false;
        if (visibleRef.current) {
            if (sdcV < 0.5) speedCondition = true;
        } else {
            if (sdcV < 0.1) speedCondition = true;
        }
        
        let foundRedLight = false;
        
        if (speedCondition) {
            const RED_STATES = [1, 4, 7];
            
            // Scan for close RED lights
            for (const light of trafficLights) {
                 const safeLightFrame = Math.min(Math.max(0, currentFrameIdx), light.trajectory.length - 1);
                 const step = light.trajectory[safeLightFrame];
                 const state = step ? step.state : 0;
                 
                 if (RED_STATES.includes(state)) {
                     const dx = light.x - sdcPos.x;
                     const dy = light.y - sdcPos.y;
                     const distSq = dx*dx + dy*dy;
                     // 1. Distance check: < 30m radius (900)
                     if (distSq < 900) {
                         // 2. Directional Check: Is it in front?
                         // SDC Yaw/Heading
                         const yaw = sdcPos.bbox_yaw || 0; // Ensure we have yaw
                         // Car forward vector
                         const carFx = Math.cos(yaw);
                         const carFy = Math.sin(yaw);
                         
                         // Vector to light
                         const len = Math.sqrt(distSq);
                         const toLightX = dx / len;
                         const toLightY = dy / len;
                         
                         // Dot product
                         const dot = carFx * toLightX + carFy * toLightY;
                         
                         // Threshold: > 0.5 (approx 60 deg cone each side, 120 total) 
                         // This filters out lights behind or directly to side (cross traffic).
                         if (dot > 0.5) {
                             foundRedLight = true;
                             break; 
                         }
                     }
                 }
            }
        }
        
        // Signal Debounce (Off-Delay)
        // If we see a red light, update last timestamp.
        // If we don't, check if we saw one recently (< 1s / 10 frames?).
        // Let's use 30 frames (~3s at 10Hz? No waymo is 10Hz so 3s)
        
        if (foundRedLight) {
            lastSeenFrameRef.current = currentFrameIdx;
        }
        
        let show = false;
        if (foundRedLight) {
            show = true;
        } else {
            // Grace period of 30 frames
            if (currentFrameIdx - lastSeenFrameRef.current < 30) {
                show = true;
            }
        }
        
        // HOWEVER, if speed condition is NOT met (e.g. accelerating fast), we should cut immediately?
        // Or respect grace period?
        // If we accelerate > 1.0 m/s, we want it OFF immediately.
        // So override show if !speedCondition
        
        if (!speedCondition && visibleRef.current) {
            // Force off if we are moving fast
             show = false;
        }

        // Apply Visibility
        if (show !== visibleRef.current) {
            groupRef.current.visible = show;
            visibleRef.current = show;
        }
    });

    return (
        <group ref={groupRef} visible={false}>
            {/* Simple Billboard Bubble */}
            <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
                 <group scale={0.8}>
                     {/* Background Bubble */}
                     <mesh position={[0, 0, 0]}>
                        <circleGeometry args={[0.5, 32]} />
                        <meshBasicMaterial color="white" transparent opacity={0.9} />
                     </mesh>
                     {/* Icon - Traffic Light Box */}
                     <mesh position={[0, 0, 0.01]}>
                        <planeGeometry args={[0.4, 0.4]} />
                        <meshBasicMaterial color="black" />
                     </mesh>
                     {/* Red Light */}
                     <mesh position={[0, 0, 0.02]}>
                        <circleGeometry args={[0.15, 16]} />
                        <meshBasicMaterial color="#ff0000" />
                     </mesh>
                 </group>
            </Billboard>
        </group>
    );
}
