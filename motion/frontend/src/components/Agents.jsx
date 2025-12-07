import React, { useMemo } from 'react';
import * as THREE from 'three';

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
        const pastLen = pastX.length / count; // Should be 10

        const currX = getVal('state/current/x');
        const currY = getVal('state/current/y');
        const currZ = getVal('state/current/z');
        const currYaw = getVal('state/current/bbox_yaw');
        
        const futureX = getVal('state/future/x');
        const futureY = getVal('state/future/y');
        const futureZ = getVal('state/future/z');
        const futureYaw = getVal('state/future/bbox_yaw');
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
                trajectory.push([
                    pastX[idx] - cx, 
                    pastY[idx] - cy, 
                    pastZ[idx] - cz,
                    pastYaw[idx] || 0
                ]);
            }
            
            // Current (1 frame)
            trajectory.push([
                currX[i] - cx, 
                currY[i] - cy, 
                currZ[i] - cz,
                currYaw[i] || 0
            ]);
            
            // Future (80 frames)
            for (let t = 0; t < futureLen; t++) {
                const idx = i * futureLen + t;
                trajectory.push([
                    futureX[idx] - cx, 
                    futureY[idx] - cy, 
                    futureZ[idx] - cz,
                    futureYaw[idx] || 0
                ]);
            }
            
            // Check if SDC (loosely check for 1)
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
                const pos = agent.trajectory[frame];
                if (!pos || isNaN(pos[0])) return null; // Invalid position check
                
                return (
                    <mesh key={agent.id} position={new THREE.Vector3(pos[0], pos[1], pos[2])} rotation={[0, 0, pos[3]]}> 
                        <boxGeometry args={[agent.dims[0], agent.dims[1], agent.dims[2]]} />
                        <meshStandardMaterial color={agent.isSdc ? '#00FFFF' : getTypeColor(agent.type)} />
                    </mesh>
                );
            })}
        </group>
    );
}

function getTypeColor(type) {
  switch(type) {
    case 1: return '#4285F4'; // Vehicle - Blue
    case 2: return '#EA4335'; // Pedestrian - Red
    case 3: return '#FBBC04'; // Sign - Yellow
    case 4: return '#34A853'; // Cyclist - Green
    default: return 'gray';
  }
}
