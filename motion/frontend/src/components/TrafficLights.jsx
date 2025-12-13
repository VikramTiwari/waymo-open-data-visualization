import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const TEMP_OBJECT = new THREE.Object3D();
const TEMP_COLOR = new THREE.Color();

export function TrafficLights({ trafficLights, frameRef }) {

    const housingRef = useRef();
    const redRef = useRef();
    const yellowRef = useRef();
    const greenRef = useRef();

    // Initial Setup (Matrices)
    useEffect(() => {
        if (!housingRef.current || !redRef.current || !yellowRef.current || !greenRef.current || trafficLights.length === 0) return;

        trafficLights.forEach((light, i) => {
            // Apply Z offset to lift them "up in the air" (e.g., 6m up)
            // The position 'light.x, light.y, light.z' is the stop point on the ground.
            const x = light.x;
            const y = light.y;
            const z = light.z + 6.0;
            const yaw = light.yaw || 0;

            TEMP_OBJECT.position.set(x, y, z);
            TEMP_OBJECT.rotation.set(0, 0, yaw);
            TEMP_OBJECT.scale.set(1, 1, 1);
            TEMP_OBJECT.updateMatrix();

            // Set matrix for all parts (geometry offsets handle local positions)
            housingRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
            redRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
            yellowRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
            greenRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
        });
        
        housingRef.current.instanceMatrix.needsUpdate = true;
        redRef.current.instanceMatrix.needsUpdate = true;
        yellowRef.current.instanceMatrix.needsUpdate = true;
        greenRef.current.instanceMatrix.needsUpdate = true;
    }, [trafficLights]);

    useFrame(() => {
        if (!frameRef || !redRef.current || trafficLights.length === 0) return;

        trafficLights.forEach((light, i) => {
            // Use current state (11th step, index 10) for static color as requested.
            // "stay the same color and not be blinking"
            // We use the state at the 'current' timestamp of the data snapshot.
            // light.trajectory has past (10) + current (1) + future (80)
            const staticIdx = 10;
            const step = light.trajectory[staticIdx] || light.trajectory.find(s => s) || { state: 0 };
            const state = step.state;

            // Determine colors for each bulb
            // State: 1,4,7 = Red; 2,5,8 = Yellow; 3,6 = Green; 0 = Unknown/Off

            const isRed = [1, 4, 7].includes(state);
            const isYellow = [2, 5, 8].includes(state);
            const isGreen = [3, 6].includes(state);

            // Red Bulb
            if (isRed) {
                TEMP_COLOR.set('#ff0000').multiplyScalar(5.0); // Bright Red
            } else {
                TEMP_COLOR.set('#330000'); // Dim Red
            }
            redRef.current.setColorAt(i, TEMP_COLOR);

            // Yellow Bulb
            if (isYellow) {
                TEMP_COLOR.set('#ffff00').multiplyScalar(5.0); // Bright Yellow
            } else {
                TEMP_COLOR.set('#333300'); // Dim Yellow
            }
            yellowRef.current.setColorAt(i, TEMP_COLOR);

            // Green Bulb
            if (isGreen) {
                TEMP_COLOR.set('#00ff00').multiplyScalar(5.0); // Bright Green
            } else {
                TEMP_COLOR.set('#003300'); // Dim Green
            }
            greenRef.current.setColorAt(i, TEMP_COLOR);
        });
        
        redRef.current.instanceColor.needsUpdate = true;
        yellowRef.current.instanceColor.needsUpdate = true;
        greenRef.current.instanceColor.needsUpdate = true;
    });

    // Geometries
    const geometries = React.useMemo(() => {
        // Center of box is 0,0,0. Lights will be offset relative to this.
        // We want the whole group pivot to be at the center or bottom?
        // Let's keep pivot at center of housing for rotation simplicity.

        const r = 0.15; // Bulb radius
        const bulb = new THREE.SphereGeometry(r, 16, 16);

        // We clone and translate geometries so that all instances share the same matrix (pivot at center of housing)
        // Red (Top)
        const redGeo = bulb.clone();
        redGeo.translate(0, 0, 0.4); // Top

        // Yellow (Middle)
        const yellowGeo = bulb.clone();
        yellowGeo.translate(0, 0, 0); // Center

        // Green (Bottom)
        const greenGeo = bulb.clone();
        greenGeo.translate(0, 0, -0.4); // Bottom

        // Housing Rotation:
        // By default Box is aligned with axes.
        // If yaw=0 (East, +X), the face should be towards West (-X) or similar?
        // Waymo Yaw=0 is East.
        // If we want the face (lights) to point towards the oncoming traffic.
        // Oncoming traffic yaw = 0 (East).
        // Light Yaw = 180 (West).
        // We want the "front" of the box to be -X?
        // If we just rotate the box, we just need to know which face is "front".
        // Let's assume +X is front.
        // Then we rotate by `yaw`.
        // If `yaw` is calculated as `LaneYaw + PI`, then it faces opposite to lane.

        // Let's slightly flatten the housing to look like a signal
        // width (y) = 0.5, depth (x) = 0.3?
        // Housing: 0.3 (depth, x), 0.5 (width, y), 1.5 (height, z)
        // If x is depth, front is +X or -X.
        // Bulbs should protrude from front.
        // If front is +X.
        // Bulbs translated by +0.15 in X.
        
        const housingBetter = new THREE.BoxGeometry(0.3, 0.6, 1.6);
        
        const redGeo2 = bulb.clone();
        redGeo2.translate(0.15, 0, 0.5);

        const yellowGeo2 = bulb.clone();
        yellowGeo2.translate(0.15, 0, 0);

        const greenGeo2 = bulb.clone();
        greenGeo2.translate(0.15, 0, -0.5);

        return { housing: housingBetter, red: redGeo2, yellow: yellowGeo2, green: greenGeo2 };
    }, []);

    return (
        <group>
            {/* Housing Instances */}
            {trafficLights.length > 0 && (
                <instancedMesh ref={housingRef} args={[geometries.housing, null, trafficLights.length]}>
                    <meshStandardMaterial color="#202020" />
                </instancedMesh>
            )}
            
            {/* Red Bulbs */}
            {trafficLights.length > 0 && (
                <instancedMesh ref={redRef} args={[geometries.red, null, trafficLights.length]}>
                     <meshBasicMaterial toneMapped={false} />
                </instancedMesh>
            )}

            {/* Yellow Bulbs */}
            {trafficLights.length > 0 && (
                <instancedMesh ref={yellowRef} args={[geometries.yellow, null, trafficLights.length]}>
                     <meshBasicMaterial toneMapped={false} />
                </instancedMesh>
            )}

            {/* Green Bulbs */}
            {trafficLights.length > 0 && (
                <instancedMesh ref={greenRef} args={[geometries.green, null, trafficLights.length]}>
                     <meshBasicMaterial toneMapped={false} />
                </instancedMesh>
            )}
        </group>
    );
}
