import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { WaymoCar } from './WaymoCar';
import { PedestrianAsset } from './PedestrianAsset';
import { CyclistAsset } from './CyclistAsset'; 

const TEMP_OBJECT = new THREE.Object3D();
const TEMP_COLOR = new THREE.Color();

export function Agents({ data, frameRef, center }) {
    // We compute the full trajectory for every agent ONCE when data changes.
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
        // --- RoadGraph for Parked Car Detection ---
        const mapX = getVal('roadgraph_samples/xyz'); // Packed XYZ
        const mapType = getVal('roadgraph_samples/type');
        
        const lanePoints = [];
        if (mapX && mapType) {
            for(let i=0; i<mapType.length; i++) {
                // Type 1: Lane Center, Type 2: Lane Center (other)
                if (mapType[i] === 1 || mapType[i] === 2) {
                    lanePoints.push({
                        x: mapX[i*3] - cx,
                        y: mapX[i*3+1] - cy,
                        z: mapX[i*3+2] - cz
                    });
                }
            }
        }
        // ------------------------------------------

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
            
            // Calculate Acceleration
            for (let t = 0; t < trajectory.length - 1; t++) {
                const step = trajectory[t];
                const next = trajectory[t + 1];
                const speedCurr = Math.sqrt(step.vx*step.vx + step.vy*step.vy);
                const speedNext = Math.sqrt(next.vx*next.vx + next.vy*next.vy);
                const accel = (speedNext - speedCurr) / 0.1;
                step.accel = accel;
            }
            // Last point accel
            let maxSpeed = 0;
            for(const step of trajectory) {
                const s = Math.sqrt(step.vx*step.vx + step.vy*step.vy);
                if (s > maxSpeed) maxSpeed = s;
            }
            
            // Refined Parked Logic
            let isParked = false;
            // Only check for vehicles (Type 1)
            if (type[i] === 1 && maxSpeed < 0.5) {
                const startPos = trajectory[0];
                let minDist = Infinity;
                for (let k = 0; k < lanePoints.length; k += 5) {
                    const lp = lanePoints[k];
                    const dx = lp.x - startPos.x;
                    const dy = lp.y - startPos.y;
                    const d = dx*dx + dy*dy;
                    if (d < minDist) minDist = d;
                    if (d < 4.0) break; 
                }
                if (minDist > 4.0) { // > 2m distance
                    isParked = true;
                }
            }

            const isSdc = isSdcList && isSdcList[i] == 1;

            parsedAgents.push({
                id: ids[i],
                type: type[i],
                isSdc: isSdc,
                isParked: isParked, 
                dims: [length[i], width[i], height[i] || 1.5], // L, W, H
                trajectory
            });
        }
        return parsedAgents;
    }, [data, center]);

    // Split Agents into Special (React Components) and Instanced (Generic Vehicles)
    const { specialAgents, instancedVehicles } = useMemo(() => {
        const special = [];
        const instanced = [];
        
        agents.forEach(agent => {
            // SDC, Pedestrians (2), Cyclists (4) are special
            if (agent.isSdc || agent.type === 2 || agent.type === 4) {
                special.push(agent);
            } else {
                // Generic Vehicle (1) or Signs (3) or Unknown
                // We'll instance Type 1 and defaults.
                instanced.push(agent);
            }
        });
        
        return { specialAgents: special, instancedVehicles: instanced };
    }, [agents]);

    // Ref for InstancedMesh
    const meshRef = useRef();

    useFrame(() => {
        if (!frameRef) return;
        const currentFrame = frameRef.current;
        const count = instancedVehicles.length;

        if (count === 0 || !meshRef.current) return;

        instancedVehicles.forEach((agent, i) => {
            const traj = agent.trajectory;
            const idx1 = Math.floor(currentFrame);
            const idx2 = Math.min(idx1 + 1, traj.length - 1);
            const alpha = currentFrame - idx1;

            const step1 = traj[idx1];
            const step2 = traj[idx2];
            
            if (!step1) {
                // Invisible
                TEMP_OBJECT.scale.set(0, 0, 0);
                TEMP_OBJECT.updateMatrix();
                meshRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
                return;
            }

            let x, y, z, yaw;

            if (step2 && step1 !== step2) {
                 x = THREE.MathUtils.lerp(step1.x, step2.x, alpha);
                 y = THREE.MathUtils.lerp(step1.y, step2.y, alpha);
                 z = THREE.MathUtils.lerp(step1.z, step2.z, alpha);
                 
                 let dYaw = step2.yaw - step1.yaw;
                 while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
                 while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
                 yaw = step1.yaw + dYaw * alpha;
            } else {
                 x = step1.x; y = step1.y; z = step1.z;
                 yaw = step1.yaw; 
            }

            TEMP_OBJECT.position.set(x, y, z);
            TEMP_OBJECT.rotation.set(0, 0, yaw);
            // Dimensions for Box
            TEMP_OBJECT.scale.set(agent.dims[0], agent.dims[1], agent.dims[2]);
            TEMP_OBJECT.updateMatrix();
            meshRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
            
            // Color can happen once? Or dynamic if parked state changes? 
            // Parked State is constant per agent in our logic.
            // Using logic from before:
            const colorHex = agent.isParked ? "#abcbfd" : getTypeColor(agent.type);
            TEMP_COLOR.set(colorHex);
            meshRef.current.setColorAt(i, TEMP_COLOR);
        });
        
        meshRef.current.instanceMatrix.needsUpdate = true;
        if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    });

    return (
        <group>
            {/* Special Agents (SDC, Peds, Cyclists) */}
            {specialAgents.map((agent, idx) => (
                <AgentItem key={`${agent.id}-${idx}`} agent={agent} frameRef={frameRef} />
            ))}
            
            {/* Instanced Generic Vehicles */}
            {instancedVehicles.length > 0 && (
                <instancedMesh 
                    ref={meshRef} 
                    args={[null, null, instancedVehicles.length]}
                >
                    <boxGeometry args={[1, 1, 1]} />
                    <meshStandardMaterial />
                </instancedMesh>
            )}
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
        
        const idx1 = Math.floor(currentFrame);
        const idx2 = Math.min(idx1 + 1, traj.length - 1);
        const alpha = currentFrame - idx1;

        const step1 = traj[idx1];
        const step2 = traj[idx2];
        
        if (!step1) {
            if (groupRef.current) groupRef.current.visible = false;
            return;
        }
        
        if (groupRef.current) groupRef.current.visible = true;

        let x, y, z, yaw, vx, vy, accel;
        
        if (step2 && step1 !== step2) {
             x = THREE.MathUtils.lerp(step1.x, step2.x, alpha);
             y = THREE.MathUtils.lerp(step1.y, step2.y, alpha);
             z = THREE.MathUtils.lerp(step1.z, step2.z, alpha);
             let dYaw = step2.yaw - step1.yaw;
             while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
             while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
             yaw = step1.yaw + dYaw * alpha;
             
             vx = THREE.MathUtils.lerp(step1.vx, step2.vx, alpha);
             vy = THREE.MathUtils.lerp(step1.vy, step2.vy, alpha);
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
                arrowRef.current.scale.set(Math.max(speed * 0.5, 1), 1, 1);
            } else {
                arrowRef.current.visible = false;
            }
        }
    });
    
    return (
        <group ref={groupRef}>
             <group ref={bodyRef}>
                {agent.isSdc ? (
                        <WaymoCar dims={agent.dims} isBraking={isBraking} />
                ) : agent.type === 2 ? (
                        <PedestrianAsset color="#FF9800" />
                ) : agent.type === 4 ? (
                        <CyclistAsset />
                ) : (
                    // Fallback for special types if they slip through logic
                    <mesh> 
                        <boxGeometry args={[agent.dims[0], agent.dims[1], agent.dims[2]]} />
                        <meshStandardMaterial color={getTypeColor(agent.type)} />
                    </mesh>
                )}
             </group>
             
             <group ref={arrowRef} visible={false}>
                 <mesh position={[0.5, 0, 0]}>
                     <boxGeometry args={[1, 0.1, 0.1]} />
                     <meshBasicMaterial color={agent.isSdc ? "#00FFFF" : "#FFEB3B"} />
                 </mesh>
                 <mesh position={[1, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                     <coneGeometry args={[0.2, 0.5, 8]} />
                     <meshBasicMaterial color={agent.isSdc ? "#00FFFF" : "#FFEB3B"} />
                 </mesh>
             </group>

             {agent.isSdc && (
                 <mesh position={[0, 0, -0.7]} rotation={[0, 0, 0]}>
                    <ringGeometry args={[2.0, 2.5, 32]} />
                    <meshBasicMaterial color="#00FFFF" transparent opacity={0.3} side={THREE.DoubleSide} />
                 </mesh>
             )}
        </group>
    );
}

function getTypeColor(type) {
  switch(type) {
    case 1: return '#4285F4'; 
    case 2: return '#FF9800'; 
    case 3: return '#FBBC04';
    case 4: return '#34A853'; 
    default: return 'gray';
  }
}
