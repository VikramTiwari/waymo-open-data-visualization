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
            {trafficLights.map((light, idx) => {
                // Safe Frame Access with Clamping
                const safeFrame = Math.min(frame, light.trajectory.length - 1);
                
                // Get Step
                let step = light.trajectory[safeFrame];
                if (!step) return null;
                
                // Fix Flickering: If state is 0 (Unknown), look back for last known valid state
                let displayState = step.state;
                if (displayState === 0) {
                     // scan backwards
                     for (let t = safeFrame - 1; t >= 0; t--) {
                         if (light.trajectory[t].state !== 0) {
                             displayState = light.trajectory[t].state;
                             break;
                         }
                     }
                }
                
                // If still 0, maybe look forward? Or just default to Gray.
                
                // Get Color
                const color = getStateColor(displayState);
                
                // Basic visualization: A small sphere or box at the location
                // Traffic lights are usually up high. Z might already reflect that.
                
                return (
                    <group key={`${light.id}-${idx}`} position={[step.x, step.y, step.z]}>
                         {/* Casing */}
                        <mesh position={[0, 0, 0]}>
                            <boxGeometry args={[0.5, 0.5, 1.2]} />
                            <meshStandardMaterial color="#222" />
                        </mesh>
                        {/* Light */}
                        <mesh position={[0, 0, 0]}>
                            <sphereGeometry args={[0.3, 16, 16]} />
                            <meshBasicMaterial color={color} toneMapped={false} />
                        </mesh>
                    </group>
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
