import React, { useMemo } from 'react';
import * as THREE from 'three';
import { WaymoCar } from './WaymoCar';
import { PedestrianAsset } from './PedestrianAsset';
import { CyclistAsset } from './CyclistAsset'; 

export function Agents({ data, frame, center }) {
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
            
            // Past (10 frames)
            for (let t = 0; t < pastLen; t++) {
                const idx = i * pastLen + t;
                trajectory.push({
                    x: pastX[idx] - cx,
                    y: pastY[idx] - cy,
                    z: pastZ[idx] - cz,
                    yaw: pastYaw[idx] || 0,
                    vx: pastVx[idx] || 0,
                    vy: pastVy[idx] || 0
                });
            }
            
            // Current (1 frame)
            trajectory.push({
                x: currX[i] - cx,
                y: currY[i] - cy,
                z: currZ[i] - cz,
                yaw: currYaw[i] || 0,
                vx: currVx[i] || 0,
                vy: currVy[i] || 0
            });
            
            // Future (80 frames)
            for (let t = 0; t < futureLen; t++) {
                const idx = i * futureLen + t;
                trajectory.push({
                    x: futureX[idx] - cx,
                    y: futureY[idx] - cy,
                    z: futureZ[idx] - cz,
                    yaw: futureYaw[idx] || 0,
                    vx: futureVx[idx] || 0,
                    vy: futureVy[idx] || 0
                });
            }
            
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
            {agents.map(agent => {
                const step = agent.trajectory[frame];
                if (!step || isNaN(step.x)) return null; 
                
                const { x, y, z, yaw, vx, vy } = step;
                
                // Calculate Speed and Direction for Arrow
                // Speed = magnitude
                const speed = Math.sqrt(vx*vx + vy*vy);
                const showArrow = speed > 0.5; // Only show if moving somewhat
                
                // Arrow rotation: Atan2(vy, vx) - typical math angle.
                // ThreeJS rotation Z usually matches math angle if +X is 0.
                // Waymo Yaw is typically East=0, North=pi/2? Or ENU?
                // Let's use standard atan2.
                // Note: The agent box is rotated by `yaw`. 
                // The arrow should be rotated by `atan2(vy, vx)`.
                
                const arrowYaw = Math.atan2(vy, vx);

                return (
                    <group key={agent.id} position={[x, y, z]}>
                        {/* Agent Body */}
                        <group rotation={[0, 0, yaw]}>
                            {agent.isSdc ? (
                                    <WaymoCar dims={agent.dims} />
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
                        
                        {/* Velocity Vector Arrow */}
                        {showArrow && (
                            <group rotation={[0, 0, arrowYaw]} position={[0, 0, agent.dims[2] + 0.5]}>
                                {/* Arrow Shaft */}
                                <mesh position={[speed / 2, 0, 0]}>
                                    <boxGeometry args={[speed, 0.1, 0.1]} />
                                    <meshBasicMaterial color={agent.isSdc ? "#00FF00" : "#444444"} transparent opacity={agent.isSdc ? 1 : 0.5} />
                                </mesh>
                                {/* Arrow Head */}
                                <mesh position={[speed, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                                     <coneGeometry args={[0.2, 0.5, 8]} />
                                     <meshBasicMaterial color={agent.isSdc ? "#00FF00" : "#444444"} transparent opacity={agent.isSdc ? 1 : 0.5} />
                                </mesh>
                            </group>
                        )}
                    </group>
                );
            })}
        </group>
    );
}

function getTypeColor(type) {
  switch(type) {
    case 1: return '#4285F4'; // Vehicle - Blue
    case 2: return '#FF9800'; // Pedestrian - Orange
    case 3: return '#FBBC04'; // Sign - Yellow
    case 4: return '#34A853'; // Cyclist - Green
    default: return 'gray';
  }
}
