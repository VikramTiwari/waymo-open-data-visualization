import React, { useMemo } from 'react';
import * as THREE from 'three';

export function WaymoCar({ dims = [4.68, 2.0, 1.56], isBraking = false }) {
    // Default Waymo I-Pace dimensions: L: 4.68, W: 2.0, H: 1.56
    const [length, width, height] = dims;

    const { bodyGeom, cabinGeom } = useMemo(() => {
        // --- 1. Lower Body Shape (Chassis) ---
        // Provides the base width and robust look.
        const bodyShape = new THREE.Shape();
        const halfL = length / 2;
        const groundClearance = 0.35; // Lifted for big wheels
        const beltLine = Math.max(height * 0.55, 0.95); // Ensure beltline clears the huge arches
        
        // Start Rear Bottom (Diffuser area)
        bodyShape.moveTo(-halfL + 0.15, groundClearance + 0.05); // Indent for diffuser
        bodyShape.lineTo(-halfL + 0.05, groundClearance);         // Bottom edge
        
        // Rear Bumper (Sculpted & Rounded)
        // Push out slightly to make it look 'muscular' then curve up
        bodyShape.bezierCurveTo(
            -halfL - 0.2, groundClearance + 0.15, // Control point 1: Push back and up
            -halfL - 0.15, beltLine * 0.4,       // Control point 2: Keep it wide
            -halfL, beltLine                     // End point
        );

        // Hood Line (Flat-ish top of body)
        // From rear to start of windshield
        bodyShape.lineTo(halfL - 1.2, beltLine); 
        
        // Hood Slope (Gentle down to nose)
        bodyShape.quadraticCurveTo(halfL - 0.5, beltLine, halfL - 0.2, beltLine - 0.15);

        // Nose / Front Bumper (Vertical drop then curve in)
        bodyShape.quadraticCurveTo(halfL + 0.05, beltLine - 0.2, halfL, groundClearance + 0.2);
        bodyShape.lineTo(halfL - 0.15, groundClearance);

        // --- Bottom with Wheel Wells ---
        const wheelPosFwd = length * 0.36;
        const wheelPosRear = -length * 0.36;
        const wheelRadius = 0.55; // 1.5x of approx 0.36
        const wellRadius = wheelRadius * 1.1; // Clearance
        
        // 1. To Front Well Front Edge
        bodyShape.lineTo(wheelPosFwd + wellRadius, groundClearance);
        
        // 2. Front Wheel Arch
        bodyShape.bezierCurveTo(
            wheelPosFwd + wellRadius, groundClearance + wellRadius * 1.5, // Arch higher
            wheelPosFwd - wellRadius, groundClearance + wellRadius * 1.5,
            wheelPosFwd - wellRadius, groundClearance
        );

        // 3. To Rear Well Front Edge
        bodyShape.lineTo(wheelPosRear + wellRadius, groundClearance);

        // 4. Rear Wheel Arch
        bodyShape.bezierCurveTo(
            wheelPosRear + wellRadius, groundClearance + wellRadius * 1.5,
            wheelPosRear - wellRadius, groundClearance + wellRadius * 1.5,
            wheelPosRear - wellRadius, groundClearance
        );

        // 5. To End (Rear Diffuser Start)
        bodyShape.lineTo(-halfL + 0.15, groundClearance);
        
        // Diffuser notch close
        bodyShape.lineTo(-halfL + 0.15, groundClearance + 0.05);

        // --- 2. Cabin Shape (Greenhouse) ---
        // Sits on top of the body, narrower.
        const cabinShape = new THREE.Shape();
        const roofHeight = height * 0.9; // Slightly lower to allow for curve apex
        
        // Start Base of Windshield
        cabinShape.moveTo(halfL - 0.9, beltLine);
        
        // Windshield (Slightly curved)
        cabinShape.quadraticCurveTo(
            halfL - 1.1, beltLine + 0.2,
            halfL - 1.3, roofHeight * 0.98
        );
        
        // Roof (Aerodynamic Curve)
        // Apex around 0 or slightly forward
        cabinShape.bezierCurveTo(
            halfL - 1.6, roofHeight + 0.05, // Apex
            -halfL + 1.2, roofHeight + 0.02, 
            -halfL + 0.7, roofHeight - 0.02  // Taper down slightly at rear
        );
        
        // Spoiler Lip
        cabinShape.lineTo(-halfL + 0.4, roofHeight - 0.02); // Extend back
        cabinShape.lineTo(-halfL + 0.35, roofHeight - 0.08); // Lip edge down
        
        // Rear Window / Hatch (Fastback slope)
        cabinShape.bezierCurveTo(
            -halfL + 0.2, roofHeight - 0.3, // Curve in
            -halfL + 0.1, beltLine + 0.2,
            -halfL + 0.15, beltLine
        );
        
        // Close shape
        cabinShape.lineTo(halfL - 0.9, beltLine); 
        
        // ... (Extrusion settings same, removed for brevity in replacement if block allows)
        
        // --- 3. Extrusion Settings ---
        const bodyExtrude = {
            depth: width,
            bevelEnabled: true,
            bevelSegments: 8, // Soften edges significantly
            steps: 2,
            bevelSize: 0.08,  // Rounder corners
            bevelThickness: 0.08
        };

        const cabinExtrude = {
            depth: width * 0.72, // Tapered top (tumblehome)
            bevelEnabled: true,
            bevelSegments: 4,
            steps: 2,
            bevelSize: 0.04,
            bevelThickness: 0.04
        };

        return { 
            bodyGeom: new THREE.ExtrudeGeometry(bodyShape, bodyExtrude),
            cabinGeom: new THREE.ExtrudeGeometry(cabinShape, cabinExtrude),
        };
    }, [length, width, height]);

    return (
        <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -height / 2]}>
            {/* ... Coordinate System comments ... */}

            {/* Lower Body */}
            <mesh geometry={bodyGeom} position={[0, 0, -width / 2]}>
                <meshStandardMaterial color="#FFFFFF" roughness={0.6} metalness={0.1} />
            </mesh>

            {/* Cabin Geometry - Centered on top */}
            <mesh geometry={cabinGeom} position={[0, 0, -(width * 0.75) / 2]}>
                 <meshStandardMaterial color="#111111" roughness={0.2} metalness={0.8} />
            </mesh>
            
            {/* Details and Sensors need to be adjusted for height if needed... 
                But let's leave them relative for now or they might float inside/outside.
                Actually, grill/lights depended on height * 0.35.
                with groundClearance 0.35, the grill might be low.
                Let's bump them.
            */}
            
             {/* Front Grill - Bump Height */}
            <mesh position={[length / 2 - 0.05, height * 0.45, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[width * 0.6, 0.4]} />
                <meshStandardMaterial color="#000000" roughness={0.8} />
            </mesh>
             {/* Grill emblem area */}
            <mesh position={[length / 2, height * 0.45, 0]} rotation={[0, Math.PI / 2, 0]}>
                 <boxGeometry args={[0.15, 0.15, 0.05]} />
                 <meshStandardMaterial color="#333" />
            </mesh>

            {/* Headlights - Bump Height */}
            <Light position={[length / 2 - 0.1, height * 0.52, width * 0.35]} color="#E0E0FF" scale={[0.4, 0.15, 0.6]} rotation={[0, 0, -0.1]} />
            <Light position={[length / 2 - 0.1, height * 0.52, -width * 0.35]} color="#E0E0FF" scale={[0.4, 0.15, 0.6]} rotation={[0, 0, -0.1]} />

            {/* Taillights (Rear) - Red (Brake) - Circular-ish */}
            <Light 
                position={[-length * 0.5 - 0.15, height * 0.6, width * 0.4]} 
                color="#FF0000" 
                intensity={isBraking ? 5.0 : 2.0} 
                scale={[0.1, 0.25, 0.25]} 
                shape="circle"
            />
            <Light 
                position={[-length * 0.5 - 0.15, height * 0.6, -width * 0.4]} 
                color="#FF0000" 
                intensity={isBraking ? 5.0 : 2.0} 
                scale={[0.1, 0.25, 0.25]} 
                shape="circle"
            />

            {/* Turn Signals (Amber) - Circular-ish */}
            <Light 
                position={[-length * 0.5 - 0.12, height * 0.6 - 0.15, width * 0.4]} 
                color="#FFAA00" 
                intensity={2.0} 
                scale={[0.1, 0.15, 0.15]} 
                shape="circle"
            />
            <Light 
                position={[-length * 0.5 - 0.12, height * 0.6 - 0.15, -width * 0.4]} 
                color="#FFAA00" 
                intensity={2.0} 
                scale={[0.1, 0.15, 0.15]} 
                shape="circle"
            />


            {/* --- Wheels --- */}
            {/* Positioned relative to car center. 
                New Radius 0.55. Y Position should be 0.55 to sit on ground (if Z=-height/2 is ground? No, usually 0 is center).
                Wait, if group is at -height/2 (-0.78), and wheel Y is 0.55. Wheel bottom is at -0.23 rel to group.
                Group Y in World is Z. Group Z is -0.78. 
                Wheel Bottom World Z = -0.78 + 0 (if wheel Y=0.55 and Radius=0.55 -> bottom is 0 rel to wheel center 0.55).
                Wait, Wheel Center Y = 0.55. Bottom Y = 0.
                So Wheel Bottom matches Group origin Y (which is 0 in Shape coords).
                Shape coords Y map to World Z.
                So Wheel Bottom World Z = Group World Z.
                Group World Z is -height/2 = -0.78.
                So Wheel is subterranean.
                
                We want Wheel on ground (World Z=0).
                If Group World Z = -0.78.
                We need Wheel Bottom World Z = 0.
                So Wheel Bottom Local Y needs to be +0.78.
                So Wheel Center Local Y needs to be +0.78 + 0.55 = 1.33.
                
                Previously: Y was 0.36. Radius 0.36. Bottom at 0. Group at -height/2.
                So the old car WAS subterranean by 0.78m?
                Or does existing code assume `WaymoCar` is positioned at Ground?
                `Agents.jsx`: 
                `position={[agent.x - center[0], agent.y - center[1], agent.z - center[2]]}`.
                `agent.z` is usually centroid or bottom? Waymo data `z` is centroid of bbox.
                Bbox height 1.56. Centroid Z ~ 0.78.
                So `agent.z` is ~0.78.
                If Scene center[2] is 0 (approx).
                Car is at Z=0.78.
                Group is at Z = 0.78 + (-0.78) = 0.
                So Group Origin IS at roughly Ground Level (Z=0).
                
                So, if Group Origin is Ground:
                Wheel Bottom Local Y shoud be 0.
                Wheel Center Local Y = Radius.
                So for Radius 0.55, Center Y = 0.55.
            */}
            <DetailedWheel position={[length * 0.36, 0.55, width * 0.52]} radius={0.55} />
            <DetailedWheel position={[length * 0.36, 0.55, -width * 0.52]} radius={0.55} rotation={[Math.PI, 0, 0]} />
            <DetailedWheel position={[-length * 0.36, 0.55, width * 0.52]} radius={0.55} />
            <DetailedWheel position={[-length * 0.36, 0.55, -width * 0.52]} radius={0.55} rotation={[Math.PI, 0, 0]} />

             {/* --- Sensor Suite --- */}
             {/* Roof Tiara */}
             <DetailedSensorSuite position={[0, height * 0.88, 0]} />
             
             {/* Front Fender Pods */}
             <SensorPod position={[length * 0.36, height * 0.58, width * 0.52]} rotation={[0, 0, -0.2]} />
             <SensorPod position={[length * 0.36, height * 0.58, -width * 0.52]} rotation={[0, 0, 0.2]} />

             {/* Rear Roof Pucks */}
             <SensorPod position={[-length * 0.35, height * 0.86, width * 0.35]} scale={0.5} />
             <SensorPod position={[-length * 0.35, height * 0.86, -width * 0.35]} scale={0.5} />
             
             {/* Perimeter Sensors (Bumper Pucks) */}
             <mesh position={[length/2, 0.4, 0.6]}> <boxGeometry args={[0.05, 0.1, 0.1]} /> <meshStandardMaterial color="#111"/> </mesh>
             <mesh position={[length/2, 0.4, -0.6]}> <boxGeometry args={[0.05, 0.1, 0.1]} /> <meshStandardMaterial color="#111"/> </mesh>
             <mesh position={[-length/2, 0.4, 0.6]}> <boxGeometry args={[0.05, 0.1, 0.1]} /> <meshStandardMaterial color="#111"/> </mesh>
             <mesh position={[-length/2, 0.4, -0.6]}> <boxGeometry args={[0.05, 0.1, 0.1]} /> <meshStandardMaterial color="#111"/> </mesh>

        </group>
    );
}

function DetailedWheel({ position, rotation = [0, 0, 0], radius = 0.4 }) {
    const width = 0.26;
    return (
        <group position={position} rotation={rotation}>
            {/* Tire */}
            <mesh>
                <torusGeometry args={[radius - 0.08, 0.08, 16, 32]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
             {/* Tire Tread/Thickness filler */}
            <mesh rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[radius - 0.02, radius - 0.02, width - 0.05, 32]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>
            {/* Rim */}
            <mesh rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[radius * 0.65, radius * 0.65, width * 0.6, 32]} />
                <meshStandardMaterial color="#CCCCCC" metalness={0.8} roughness={0.2} />
            </mesh>
            {/* Spokes */}
            <mesh rotation={[Math.PI/2, 0, 0]}>
                <cylinderGeometry args={[radius * 0.62, radius * 0.62, width*0.65, 5]} />
                <meshStandardMaterial color="#444" metalness={0.6} />
            </mesh>
        </group>
    )
}

function DetailedSensorSuite({ position }) {
    return (
        <group position={position}>
            {/* Mount Structure */}
             <mesh position={[0, 0.05, 0]}>
                <boxGeometry args={[0.8, 0.1, 0.4]} />
                <meshStandardMaterial color="#eeeeee" />
            </mesh>
            {/* Main Dome (Waymo Driver) */}
            <mesh position={[0, 0.25, 0]}>
                 <cylinderGeometry args={[0.18, 0.2, 0.4, 32]} />
                 <meshStandardMaterial color="#111" metalness={0.9} roughness={0.1} />
            </mesh>
             {/* Top Puck */}
            <mesh position={[0, 0.45, 0]}>
                <cylinderGeometry args={[0.2, 0.2, 0.05, 32]} />
                <meshStandardMaterial color="#222" metalness={0.5} />
            </mesh>
            {/* Side Cameras/LiDARs on rack */}
            <mesh position={[0.3, 0.15, 0.15]} rotation={[0, 0, -0.3]}>
                <cylinderGeometry args={[0.05, 0.06, 0.15, 16]} />
                <meshStandardMaterial color="#111" />
            </mesh>
            <mesh position={[0.3, 0.15, -0.15]} rotation={[0, 0, 0.3]}>
                <cylinderGeometry args={[0.05, 0.06, 0.15, 16]} />
                <meshStandardMaterial color="#111" />
            </mesh>
        </group>
    )
}

function SensorPod({ position, rotation, scale = 1 }) {
    return (
        <group position={position} rotation={rotation} scale={scale}>
             <mesh>
                 <cylinderGeometry args={[0.07, 0.08, 0.15, 16]} />
                 <meshStandardMaterial color="#111" metalness={0.8} />
            </mesh>
        </group>
    )
}

function Light({ position, color, intensity = 1.0, scale = [1, 1, 1], rotation = [0,0,0], shape = 'box' }) {
    return (
        <mesh position={position} scale={scale} rotation={rotation}>
            {shape === 'circle' ? (
                <sphereGeometry args={[0.5, 32, 16]} />
            ) : (
                <boxGeometry args={[1, 1, 1]} />
            )}
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} />
        </mesh>
    );
}
