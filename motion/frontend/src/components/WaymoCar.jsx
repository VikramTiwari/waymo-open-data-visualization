import React, { useMemo } from 'react';
import * as THREE from 'three';

export function WaymoCar({ dims = [4.68, 2.0, 1.56], isBraking = false }) {
    // Default Waymo I-Pace dimensions
    // L: 4.68, W: 2.0, H: 1.56
    const [length, width, height] = dims;

    const carProps = useMemo(() => {
        const bodyShape = new THREE.Shape();
        // Side profile logic (facing +X, so length is on X axis)
        // Center of car is 0,0. Rear is -L/2, Front is +L/2
        const halfL = length / 2;
        const hoodHeight = height * 0.45;
        const roofHeight = height * 0.85; // slightly lower than full bounding box which includes sensors
        const groundClearance = 0.2;
        
        // Start bottom rear (slightly inward for rounded bumper)
        bodyShape.moveTo(-halfL + 0.2, groundClearance);
        
        // Rear Lower Bumper (Round corner)
        bodyShape.quadraticCurveTo(-halfL, groundClearance, -halfL, groundClearance + 0.25);

        // Rear Vertical Bumper (Slight curve outwards then in)
        bodyShape.quadraticCurveTo(-halfL, hoodHeight, -halfL + 0.35, hoodHeight + 0.05);
        
        // Rear Windshield / Hatch (Rounder transition to roof)
        bodyShape.bezierCurveTo(
            -halfL + 0.5, hoodHeight + 0.2, // cp1
            -halfL + 0.5, roofHeight,       // cp2 (pulls it back/round)
            -halfL + 1.1, roofHeight        // end
        );
        
        // Roof line (gentle curve)
        bodyShape.lineTo(halfL - 1.3, roofHeight);
        
        // Windshield curve to hood
        bodyShape.quadraticCurveTo(halfL - 0.8, roofHeight, halfL - 0.4, hoodHeight);
        
        // Hood curve to nose
        bodyShape.quadraticCurveTo(halfL - 0.1, hoodHeight - 0.05, halfL, hoodHeight - 0.2);
        
        // Front Bumper / Nose curve down
        bodyShape.quadraticCurveTo(halfL + 0.05, groundClearance + 0.2, halfL - 0.1, groundClearance);
        
        // Bottom line
        bodyShape.lineTo(-halfL, groundClearance);

        const extrudeSettings = {
            depth: width * 0.9, // slightly narrower than full width for body
            bevelEnabled: true,
            bevelSegments: 8, // Smoother edges
            steps: 4,
            bevelSize: 0.08,  // Softer corners
            bevelThickness: 0.08
        };

        return { bodyShape, extrudeSettings };
    }, [length, width, height]);

    return (
        <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -height / 2]}> {/* Rotate X 90deg and center vertically */}
             
             {/* Center the extrusion width-wise. Extrusion goes from 0 to +Depth(Width) along Shape Z (now World -Y). 
                 So we need to shift by +Depth/2 in Shape Z (World -Y) to center it.
                 Depth is width * 0.9. Half is 0.45.
             */}
             <group position={[0, 0, -width * 0.45]}> {/* Centering the width precisely */}
                  
                  {/* BodyMesh */}
                  <mesh>
                      <extrudeGeometry args={[carProps.bodyShape, carProps.extrudeSettings]} />
                      <meshStandardMaterial 
                        color="#FFFFFF" 
                        roughness={0.5}
                        emissive="#444444" 
                      />
                  </mesh>

                  {/* Wheel Wells (Visual only) - Removed to prevent blocky look */}
             </group>

             {/* 
                Wheels
                Parent Group is rotated +90 X.
                New System:
                Local X = World X.
                Local Y = World Z (Up) -> This allows us to place items using Height on Y!
                Local Z = World -Y (Right).
                
                So when placing sub-components, we can use:
                x = Length pos
                y = Height pos
                z = Width pos (Left/Right)
             */}

             {/* Wheels - Positioned in the Shape Coordinate System (Y is Up, Z is Width) */}
             {/* Front Left (+ Width) - Push out to 0.5 to clear body (0.45) */}
             <DetailedWheel position={[length * 0.35, 0.35, width * 0.5]} />
             {/* Front Right (- Width) */}
             <DetailedWheel position={[length * 0.35, 0.35, -width * 0.5]} rotation={[Math.PI, 0, 0]} />
             {/* Rear Left */}
             <DetailedWheel position={[-length * 0.35, 0.35, width * 0.5]} />
             {/* Rear Right */}
             <DetailedWheel position={[-length * 0.35, 0.35, -width * 0.5]} rotation={[Math.PI, 0, 0]} />

             {/* Sensor Suite (Roof) - Centered */}
             {/* Lowered to 0.84 to sit on/in roof (roof height is 0.85) */}
             <DetailedSensorSuite position={[0, height*0.84, 0]} />
             
             {/* Fender Sensors */}
             {/* Z is Width here. Push out to 0.55 to clear bevels. */}
             <SensorPod position={[length * 0.38, height * 0.6, width * 0.55]} rotation={[0, 0, -0.4]} />
             <SensorPod position={[length * 0.38, height * 0.6, -width * 0.55]} rotation={[0, 0, 0.4]} />

             {/* Rear Roof Sensors (Small Pucks) */}
             <SensorPod position={[-length * 0.28, height * 0.92, width * 0.35]} scale={0.6} />
             <SensorPod position={[-length * 0.28, height * 0.92, -width * 0.35]} scale={0.6} />

             {/* Lights */}
             {/* Headlights (Front) - White - Move further forward to +0.1 to clear bumper */}
             <Light position={[length * 0.5 + 0.1, height * 0.35, width * 0.38]} color="#E0E0FF" scale={[1, 1.2, 1.2]} />
             <Light position={[length * 0.5 + 0.1, height * 0.35, -width * 0.38]} color="#E0E0FF" scale={[1, 1.2, 1.2]} />
             
             {/* Taillights (Rear) - Red */}
             {/* Brighten if braking */}
             <Light 
                position={[-length * 0.48, height * 0.45, width * 0.35]} 
                color="#FF0000" 
                intensity={isBraking ? 5.0 : 2.0} 
                scale={[1, 0.8, 1]} 
             />
             <Light 
                position={[-length * 0.48, height * 0.45, -width * 0.35]} 
                color="#FF0000" 
                intensity={isBraking ? 5.0 : 2.0} 
                scale={[1, 0.8, 1]} 
             />
        </group>
    );
}

function DetailedWheel({ position, rotation = [0, 0, 0] }) {
    const radius = 0.35;
    const width = 0.25;
    return (
        <group position={position} rotation={rotation}>
            {/* Tire - Torus default faces Z, which is our axle axis. No rotation needed. */}
            <mesh>
                <torusGeometry args={[radius - 0.08, 0.08, 16, 32]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            {/* Inner Hub - Cylinder default axis is Y. Rotate 90 X to face Z. */}
            <mesh rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[radius - 0.08, radius - 0.08, width, 32]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            {/* Rim */}
            <mesh rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[radius * 0.6, radius * 0.6, width * 0.6, 32]} />
                <meshStandardMaterial color="#C0C0C0" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Spokes */}
            <mesh rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[radius * 0.58, radius * 0.58, width*0.7, 5]} />
                <meshStandardMaterial color="#333" metalness={0.5} />
            </mesh>
        </group>
    )
}

function DetailedSensorSuite({ position }) {
    return (
        <group position={position}>
            {/* Base Riser - Cylinder aligns Y by default (Up) */}
             <mesh position={[0, 0.05, 0]}>
                <cylinderGeometry args={[0.2, 0.25, 0.1, 32]} />
                <meshStandardMaterial color="#fff" />
            </mesh>
            {/* Main Dome */}
            <mesh position={[0, 0.2, 0]}>
                 <cylinderGeometry args={[0.25, 0.25, 0.3, 32]} />
                 <meshStandardMaterial color="#111" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Spinning LiDAR */}
            <mesh position={[0, 0.36, 0]}>
                <cylinderGeometry args={[0.26, 0.26, 0.05, 32]} />
                <meshStandardMaterial color="#222" metalness={0.5} />
            </mesh>
            {/* Waymo Logo Ring */}
            <mesh position={[0, 0.15, 0]} rotation={[Math.PI/2, 0, 0]}>
                <torusGeometry args={[0.26, 0.02, 16, 64]} />
                 <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={2} />
            </mesh>
        </group>
    )
}

function SensorPod({ position, rotation }) {
    return (
        <group position={position} rotation={rotation}>
             <mesh>
                 <cylinderGeometry args={[0.08, 0.1, 0.12, 16]} />
                 <meshStandardMaterial color="#111" metalness={0.8} />
            </mesh>
        </group>
    )
}

function Light({ position, color, intensity = 1.0, scale = [1, 1, 1] }) {
    return (
        <mesh position={position} scale={scale}>
            <boxGeometry args={[0.05, 0.15, 0.3]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} />
        </mesh>
    );
}
