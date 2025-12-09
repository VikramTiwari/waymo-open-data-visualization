import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const TEMP_OBJECT = new THREE.Object3D();
const TEMP_COLOR = new THREE.Color();

export function TrafficLights({ trafficLights, frameRef }) {

    const casingRef = useRef();
    const bulbRef = useRef();

    // Initial Setup (Matrices)
    useEffect(() => {
        if (!casingRef.current || !bulbRef.current || trafficLights.length === 0) return;

        trafficLights.forEach((light, i) => {
            TEMP_OBJECT.position.set(light.x, light.y, light.z);
            TEMP_OBJECT.rotation.set(0, 0, 0); // Todo: Yaw? Lights usually have orientation.
            // Current schema has traffic_light_state/current/x,y,z but NO quantization of yaw/axis in this list?
            // "state/current/bbox_yaw" is for agents.
            // Traffic lights in Waymo are usually point features with state. 
            // Orientation might be in roadgraph/samples or implicit?
            // Previous code didn't rotate them.
            TEMP_OBJECT.scale.set(1, 1, 1);
            TEMP_OBJECT.updateMatrix();

            casingRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
            bulbRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
        });
        
        casingRef.current.instanceMatrix.needsUpdate = true;
        bulbRef.current.instanceMatrix.needsUpdate = true;
    }, [trafficLights]);

    useFrame(() => {
        if (!frameRef || !bulbRef.current || trafficLights.length === 0) return;

        const currentFrame = frameRef.current;
        
        trafficLights.forEach((light, i) => {
            const traj = light.trajectory;
            const idx = Math.min(Math.floor(currentFrame), traj.length - 1);
            const step = traj[idx];

            if (step) {
                const colorHex = getStateColor(step.state);
                TEMP_COLOR.set(colorHex);
                // Boost intensity for Bloom
                if (step.state !== 0) {
                     TEMP_COLOR.multiplyScalar(3.0); 
                }
            } else {
                TEMP_COLOR.set('#101010'); // Dark Gray/Off (Lower than before)
            }
            bulbRef.current.setColorAt(i, TEMP_COLOR);
        });
        
        bulbRef.current.instanceColor.needsUpdate = true;
    });

    // Geometries with Offset (Pivot at base)
    const geometries = React.useMemo(() => {
        const box = new THREE.BoxGeometry(0.5, 0.5, 1.2);
        box.translate(0, 0, 0.6); // Pivot at base Z=0, extends to Z=1.2
        
        const sphere = new THREE.SphereGeometry(0.3, 16, 16);
        sphere.translate(0, 0, 0.9); // Center at Z=0.9 (near top of box)
        
        return { box, sphere };
    }, []);

    return (
        <group>
            {/* Casing Instances */}
            {trafficLights.length > 0 && (
                <instancedMesh ref={casingRef} args={[geometries.box, null, trafficLights.length]}>
                    <meshStandardMaterial color="#222" />
                </instancedMesh>
            )}
            
            {/* Bulb Instances */}
            {trafficLights.length > 0 && (
                <instancedMesh ref={bulbRef} args={[geometries.sphere, null, trafficLights.length]}>
                     <meshBasicMaterial toneMapped={false} />
                </instancedMesh>
            )}
        </group>
    );
}

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
