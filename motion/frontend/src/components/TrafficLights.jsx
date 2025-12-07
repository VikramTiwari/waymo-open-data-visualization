import React, { useMemo } from 'react';
import * as THREE from 'three';

export function TrafficLights({ data, frame, center }) {
    const trafficLights = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return [];
        
        // Helper to handle map creation robustly
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
        
        // Traffic light data is usually indexed by ID
        // Note: The schema has traffic_light_state/current/id etc.
        // We will retrieve all related fields.
        
        const ids = getVal('traffic_light_state/current/id');
        const count = ids.length;
        if (count === 0) return [];

        // Check availability of past/future data
        // Sometimes traffic lights might not have full temporal history in the same way, or minimal history.
        // Let's assume structure matches Agents: 10 past, 1 current, 80 future?
        // Or sometimes it's just known at current state.
        
        // Let's inspect the lengths to be safe.
        const currentStates = getVal('traffic_light_state/current/state');
        const currentX = getVal('traffic_light_state/current/x');
        const currentY = getVal('traffic_light_state/current/y');
        const currentZ = getVal('traffic_light_state/current/z');
        
        const pastStates = getVal('traffic_light_state/past/state');
        const pastX = getVal('traffic_light_state/past/x');
        const pastY = getVal('traffic_light_state/past/y');
        const pastZ = getVal('traffic_light_state/past/z');

        const futureStates = getVal('traffic_light_state/future/state');
        const futureX = getVal('traffic_light_state/future/x');
        const futureY = getVal('traffic_light_state/future/y');
        const futureZ = getVal('traffic_light_state/future/z');
        
        // Determine lengths per agent
        // If pastStates exists, it should be count * 10
        const pastLen = pastStates.length > 0 ? (pastStates.length / count) : 0;
        const futureLen = futureStates.length > 0 ? (futureStates.length / count) : 0;
        
        const [cx, cy, cz] = center;

        const parsedLights = [];
        
        for (let i = 0; i < count; i++) {
            const trajectory = [];
            
            // Past
            for (let t = 0; t < pastLen; t++) {
                const idx = i * pastLen + t;
                trajectory.push({
                    state: pastStates[idx],
                    x: (pastX[idx] || 0) - cx,
                    y: (pastY[idx] || 0) - cy,
                    z: (pastZ[idx] || 0) - cz
                });
            }
            
            // Current
            trajectory.push({
                state: currentStates[i],
                x: (currentX[i] || 0) - cx,
                y: (currentY[i] || 0) - cy,
                z: (currentZ[i] || 0) - cz
            });
            
            // Future
            for (let t = 0; t < futureLen; t++) {
                const idx = i * futureLen + t;
                trajectory.push({
                    state: futureStates[idx],
                    x: (futureX[idx] || 0) - cx,
                    y: (futureY[idx] || 0) - cy,
                    z: (futureZ[idx] || 0) - cz
                });
            }
            
            parsedLights.push({
                id: ids[i],
                trajectory
            });
        }
        
        return parsedLights;
    }, [data, center]);

    return (
        <group>
            {trafficLights.map(light => {
                const step = light.trajectory[frame];
                // Fallback to last known position if frame out of partial bounds? 
                // However, our scene generally syncs frame 0..90.
                // If light data is missing for some frames, we hide it.
                if (!step) return null;
                
                // Get Color
                const color = getStateColor(step.state);
                
                // Basic visualization: A small sphere or box at the location
                // Traffic lights are usually up high. Z might already reflect that.
                
                return (
                    <mesh key={light.id} position={[step.x, step.y, step.z]}>
                        <sphereGeometry args={[0.4, 16, 16]} />
                        <meshBasicMaterial 
                            color={color} 
                        />
                    </mesh>
                );
            })}
        </group>
    );
}

// State Mapping (Standard Waymo Open Dataset)
// 1: ARROW_STOP
// 2: ARROW_CAUTION
// 3: ARROW_GO
// 4: STOP
// 5: CAUTION
// 6: GO
// 7: FLASHING_STOP
// 8: FLASHING_CAUTION
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
