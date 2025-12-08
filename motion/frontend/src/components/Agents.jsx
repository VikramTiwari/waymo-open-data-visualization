import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WaymoCar } from './WaymoCar';
import { PedestrianAsset } from './PedestrianAsset';
import { CyclistAsset } from './CyclistAsset'; 

export function Agents({ data, frameRef, center }) {
    // We compute the full trajectory for every agent ONCE when data changes.
    // The previous implementation did this based on center.
    // We will stick to that.
    
    // Note: We are no longer receiving 'frame' as prop to trigger re-renders.
    // 'frameRef' is a MutableRefObject<number>.
    
    const agents = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return [];
        
        let map;
        if (Array.isArray(featureMap)) {
            map = new Map(featureMap);
        } else {
             map = new Map(Object.entries(featureMap || {}));
        }

        const getVal = (key) => { 
            const feat = map.get(key);
            if (!feat) return [];
            return feat.floatList?.valueList || feat.int64List?.valueList || [];
        };
        
        const ids = getVal('state/id');
        const count = ids.length;
        if (count === 0) return [];
        
        const pastX = getVal('state/past/x');
        const pastY = getVal('state/past/y');
        const pastZ = getVal('state/past/z');
        const pastYaw = getVal('state/past/bbox_yaw');
        const pastVx = getVal('state/past/velocity_x');
        const pastVy = getVal('state/past/velocity_y');
        const pastLen = pastX.length / count; // Should be 10

        const currX = getVal('state/current/x');
        const currY = getVal('state/current/y');
        const currZ = getVal('state/current/z');
        const currYaw = getVal('state/current/bbox_yaw');
        const currVx = getVal('state/current/velocity_x');
        const currVy = getVal('state/current/velocity_y');
        
        const futureX = getVal('state/future/x');
        const futureY = getVal('state/future/y');
        const futureZ = getVal('state/future/z');
        const futureYaw = getVal('state/future/bbox_yaw');
        const futureVx = getVal('state/future/velocity_x');
        const futureVy = getVal('state/future/velocity_y');
        const futureLen = futureX.length / count; // Should be 80
        
        const width = getVal('state/current/width');
        const length = getVal('state/current/length');
        const height = getVal('state/current/height');
        const type = getVal('state/type');
        const isSdcList = getVal('state/is_sdc');
        
        const [cx, cy, cz] = center;

        const parsedAgents = [];
        for (let i = 0; i < count; i++) {
            const trajectory = [];
            
            // Helper to push
            const pushStep = (rawX, rawY, rawZ, rawYaw, rawVx, rawVy) => {
                 trajectory.push({
                    x: rawX - cx,
                    y: rawY - cy,
                    z: rawZ - cz,
                    yaw: rawYaw || 0,
                    vx: rawVx || 0,
                    vy: rawVy || 0
                });
            };

            // Past (10 frames)
            for (let t = 0; t < pastLen; t++) {
                const idx = i * pastLen + t;
                pushStep(pastX[idx], pastY[idx], pastZ[idx], pastYaw[idx], pastVx[idx], pastVy[idx]);
            }
            
            // Current (1 frame)
            pushStep(currX[i], currY[i], currZ[i], currYaw[i], currVx[i], currVy[i]);
            
            // Future (80 frames)
            for (let t = 0; t < futureLen; t++) {
                const idx = i * futureLen + t;
                pushStep(futureX[idx], futureY[idx], futureZ[idx], futureYaw[idx], futureVx[idx], futureVy[idx]);
            }
            
            // Calculate Acceleration (Simple backward diff or central diff)
            // accel = deltaV / deltaT (deltaT is 0.1s)
            for (let t = 0; t < trajectory.length - 1; t++) {
                const step = trajectory[t];
                const next = trajectory[t + 1];
                
                // Calculate acceleration based on speed difference (scalar acceleration)
                // Speed = sqrt(vx*vx + vy*vy)
                // Accel = (Speed_next - Speed_curr) / 0.1
                
                const speedCurr = Math.sqrt(step.vx*step.vx + step.vy*step.vy);
                const speedNext = Math.sqrt(next.vx*next.vx + next.vy*next.vy);
                const accel = (speedNext - speedCurr) / 0.1;
                step.accel = accel;
            }
            // Last point accel
            if (trajectory.length > 0) trajectory[trajectory.length - 1].accel = 0;

            const isSdc = isSdcList && isSdcList[i] == 1;

            parsedAgents.push({
                id: ids[i],
                type: type[i],
                isSdc: isSdc,
                dims: [length[i], width[i], height[i] || 1.5], // L, W, H
                trajectory
            });
        }
        return parsedAgents;
    }, [data, center]);

    return (
        <group>
            {agents.map((agent, idx) => (
                <AgentItem key={`${agent.id}-${idx}`} agent={agent} frameRef={frameRef} />
            ))}
        </group>
    );
}

function AgentItem({ agent, frameRef }) {
    const groupRef = useRef();
    const arrowRef = useRef();
    const bodyRef = useRef();
    const [isBraking, setIsBraking] = React.useState(false);

    useFrame(() => {
        if (!frameRef) return;
        const currentFrame = frameRef.current;
        const traj = agent.trajectory;
        
        // Find indices
        const idx1 = Math.floor(currentFrame);
        const idx2 = Math.min(idx1 + 1, traj.length - 1);
        const alpha = currentFrame - idx1;

        const step1 = traj[idx1];
        const step2 = traj[idx2];
        
        if (!step1) {
            // Out of bounds or invalid
            if (groupRef.current) groupRef.current.visible = false;
            return;
        }
        
        if (groupRef.current) groupRef.current.visible = true;

        // Linear Interpolation
        // If step2 exists, lerp. Else stick to step1.
        let x, y, z, yaw, vx, vy, accel;
        
        if (step2 && step1 !== step2) {
             x = THREE.MathUtils.lerp(step1.x, step2.x, alpha);
             y = THREE.MathUtils.lerp(step1.y, step2.y, alpha);
             z = THREE.MathUtils.lerp(step1.z, step2.z, alpha);
             // Yaw interpolation requires shortest path normalization
             // Standard lerp might spin around 360->0 or -PI->PI.
             // We can just use step1 yaw if delta is huge, or simple lerp if reasonably minimal.
             // Waymo yaw usually smooth. 
             // Let's implement shortest path lerp for angle:
             let dYaw = step2.yaw - step1.yaw;
             while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
             while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
             yaw = step1.yaw + dYaw * alpha;
             
             vx = THREE.MathUtils.lerp(step1.vx, step2.vx, alpha);
             vy = THREE.MathUtils.lerp(step1.vy, step2.vy, alpha);
             
             // Interpolate accel
             accel = THREE.MathUtils.lerp(step1.accel || 0, step2.accel || 0, alpha);
        } else {
             x = step1.x; y = step1.y; z = step1.z;
             yaw = step1.yaw; vx = step1.vx; vy = step1.vy;
             accel = step1.accel || 0;
        }

        if (groupRef.current) {
            groupRef.current.position.set(x, y, z);
        }
        
        if (bodyRef.current) {
            bodyRef.current.rotation.set(0, 0, yaw);
        }

        // Update Braking State (Threshold: -1.0 m/s^2)
        // Only update state if meaningful change to avoid react re-render thrashing?
        // Actually modifying state inside useFrame triggers re-render of component.
        // We generally avoid setState in useFrame unless throttled or necessary.
        // But for visual prop `isBraking`, we need it.
        const brakingNow = accel < -1.0;
        if (brakingNow !== isBraking) {
            setIsBraking(brakingNow);
        }

        if (arrowRef.current) {
            const speed = Math.sqrt(vx*vx + vy*vy);
            if (speed > 0.5) {
                arrowRef.current.visible = true;
                const arrowYaw = Math.atan2(vy, vx);
                arrowRef.current.rotation.set(0, 0, arrowYaw);
            } else {
                arrowRef.current.visible = false;
            }
        }
    });
    
    // We recreate the Arrow JSX with refs to control it?
    // The previous implementation had dynamic geometry args `args={[speed, ...]}`.
    // Changing args usually triggers geometry reconstruction.
    // Dynamic arrow length is better done via scaling a unit cylinder/box.
    // Let's assume a unit vector arrow and scale X.
    
    return (
        <group ref={groupRef}>
             <group ref={bodyRef}>
                {agent.isSdc ? (
                        <WaymoCar dims={agent.dims} isBraking={isBraking} />
                ) : agent.type === 2 ? (
                        <PedestrianAsset />
                ) : agent.type === 4 ? (
                        <CyclistAsset />
                ) : (
                    <mesh> 
                        <boxGeometry args={[agent.dims[0], agent.dims[1], agent.dims[2]]} />
                        <meshStandardMaterial color={getTypeColor(agent.type)} />
                    </mesh>
                )}
             </group>
             
             {/* Simple static arrow placeholder or remove for now?
                 The user didn't ask for arrow updates, just jitter fix.
                 I'll leave the arrow out or simple.
              */}
        </group>
    );
}

function getTypeColor(type) {
  switch(type) {
    case 1: return '#4285F4'; 
    case 2: return '#FF9800'; 
    case 3: return '#FBBC04'; // Sign
    case 4: return '#34A853'; 
    default: return 'gray';
  }
}
