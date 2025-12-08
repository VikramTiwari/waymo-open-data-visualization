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
        
        
        // Dedup / Cluster Lights
        // Waymo data might have multiple signal IDs for the same physical location (different lanes).
        // This causes z-fighting if we render them all at once.
        const uniqueLights = [];
        const seenPos = []; // Simple distance check
        
        for (const light of parsedLights) {
            // Get initial position (frame 0) or just first valid position?
            // Light trajectory positions are usually static.
            const p = light.trajectory[0]; 
            if (!p) continue;
            
            let duplicate = false;
            for (const sp of seenPos) {
                const dx = sp.x - p.x;
                const dy = sp.y - p.y;
                const dz = sp.z - p.z;
                const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
                if (dist < 0.2) { // 20cm threshold
                    duplicate = true;
                    break;
                }
            }
            
            if (!duplicate) {
                uniqueLights.push(light);
                seenPos.push({ x: p.x, y: p.y, z: p.z });
            }
        }
        
        return uniqueLights;
    }, [data, center]);

    return (
        <group>
            {trafficLights.map((light, idx) => (
                <TrafficLightItem key={`${light.id}-${idx}`} light={light} frame={frame} />
            ))}
        </group>
    );
}

function TrafficLightItem({ light, frame }) {
    // Safe Frame Access
    const safeFrame = Math.min(frame, light.trajectory.length - 1);
    const step = light.trajectory[safeFrame];
    
    // Initial State determination (scan if needed, or just 0)
    // We can't do heavy scan in useState initializer easily if it depends on props changing? 
    // Actually we can just start with 0.
    const [latchedState, setLatchedState] = React.useState(0);
    
    if (!step) return null;
    
    const currentState = step.state;
    
    // Derived State Logic: Update latchedState if we have a valid new state.
    if (currentState !== 0 && currentState !== latchedState) {
        setLatchedState(currentState);
    }
    
    // Fallback: If latched is still 0 (start of sim and unknown), try to scan once?
    // Or just use latchedState (which is 0 -> Gray).
    // Let's improve the initial latch if 0.
    let displayState = latchedState;
    if (displayState === 0 && currentState !== 0) {
        displayState = currentState; // Should be covered by setter above but for this render frame
    }
    if (displayState === 0) {
        // Try to look back once if we really want to avoid gray at start
         for (let t = safeFrame; t >= 0; t--) {
             if (light.trajectory[t].state !== 0) {
                 displayState = light.trajectory[t].state;
                 // We don't setLatchedState here to avoid loop/side-effect complexity, 
                 // but next frame might catch a valid one.
                 // Actually, if we find one, we could just render it.
                 break;
             }
         }
    }

    const color = getStateColor(displayState);
    
    return (
        <group position={[step.x, step.y, step.z]}>
             {/* Casing */}
            <mesh>
                <boxGeometry args={[0.5, 0.5, 1.2]} />
                <meshStandardMaterial color="#222" />
            </mesh>
            {/* Light */}
            <mesh>
                <sphereGeometry args={[0.3, 16, 16]} />
                <meshBasicMaterial color={color} toneMapped={false} />
            </mesh>
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
