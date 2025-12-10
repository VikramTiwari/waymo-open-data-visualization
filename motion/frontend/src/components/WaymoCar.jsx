import React, { useMemo, useState } from 'react';
import * as THREE from 'three';

export function WaymoCar({ dims = [4.68, 2.0, 1.56], isBraking = false }) {
    // Default Waymo I-Pace dimensions: L: 4.68, W: 2.0, H: 1.56
    const [length, width, height] = dims;

    const { bodyGeom, glassGeom, roofGeom } = useMemo(() => {
        const halfL = length / 2;
        const groundClearance = 0.25;
        const wheelBase = length * 0.6;
        const wheelPosFwd = wheelBase / 2;
        const wheelPosRear = -wheelBase / 2;
        const wheelRadius = 0.38;
        const wellRadius = wheelRadius * 1.15;
        const beltLine = height * 0.6; // Where glass starts

        // --- 1. Main Body Shape (Side Profile) ---
        const bodyShape = new THREE.Shape();
        
        // Start: Rear Bumper Bottom
        bodyShape.moveTo(-halfL + 0.1, groundClearance + 0.1);
        
        // Rear Bumper Curve
        bodyShape.bezierCurveTo(
            -halfL - 0.05, groundClearance + 0.2,
            -halfL, beltLine * 0.5,
            -halfL + 0.05, beltLine
        );
        
        // Trunk / Deck (Short due to hatch)
        bodyShape.lineTo(-halfL + 0.3, beltLine + 0.02);

        // -- Belt Line (Window Sill) --
        // To Hood
        bodyShape.lineTo(halfL - 0.8, beltLine - 0.05);
        
        // Hood Curve
        bodyShape.bezierCurveTo(
            halfL - 0.2, beltLine - 0.08,
            halfL - 0.05, beltLine - 0.2,
            halfL, groundClearance + 0.4
        );

        // Front Bumper / Nose
        bodyShape.lineTo(halfL, groundClearance + 0.15);
        bodyShape.quadraticCurveTo(halfL - 0.05, groundClearance, halfL - 0.2, groundClearance);

        // Front Wheel Well
        bodyShape.lineTo(wheelPosFwd + wellRadius, groundClearance);
        
        // Front Well
        bodyShape.bezierCurveTo(
            wheelPosFwd + wellRadius, groundClearance + wellRadius * 1.3,
            wheelPosFwd - wellRadius, groundClearance + wellRadius * 1.3,
            wheelPosFwd - wellRadius, groundClearance
        );

        // Side Skirt
        bodyShape.lineTo(wheelPosRear + wellRadius, groundClearance);

        // Rear Well
        bodyShape.bezierCurveTo(
            wheelPosRear + wellRadius, groundClearance + wellRadius * 1.3,
            wheelPosRear - wellRadius, groundClearance + wellRadius * 1.3,
            wheelPosRear - wellRadius, groundClearance
        );
        
        // Rear Diffuser area
        bodyShape.lineTo(-halfL + 0.1, groundClearance);
        bodyShape.lineTo(-halfL + 0.1, groundClearance + 0.1); // Close loop
        
        
        // --- 2. Glass / Cabin Shape ---
        // Sits on top of belt line.
        const glassShape = new THREE.Shape();
        const roofH = height * 0.96;
        
        // Start: Base of A-Pillar
        glassShape.moveTo(halfL - 0.85, beltLine);
        
        // A-Pillar / Windshield
        glassShape.bezierCurveTo(
            halfL - 1.0, beltLine + 0.1,
            halfL - 1.2, roofH,
            halfL - 1.4, roofH
        );
        
        // Roof Line
        glassShape.lineTo(-halfL + 0.6, roofH - 0.02);
        
        // C-Pillar / Rear Window (Hatchback slope)
        glassShape.bezierCurveTo(
            -halfL + 0.2, roofH - 0.05,
            -halfL + 0.15, beltLine + 0.2,
            -halfL + 0.3, beltLine
        );
        
        glassShape.lineTo(halfL - 0.85, beltLine); // Close

        // --- 3. Roof / Trim Shape ---
        // Just the top surface for a different material (glass roof?)
        // Or maybe just the pillars.
        // Let's make a slightly smaller shape for the actual glass to inset it from pillars.
        const windowInset = 0.05;
        const actualGlassShape = new THREE.Shape();
        actualGlassShape.moveTo(halfL - 0.85 - windowInset, beltLine + windowInset);
         actualGlassShape.bezierCurveTo(
            halfL - 1.0, beltLine + 0.1,
            halfL - 1.2, roofH - windowInset,
            halfL - 1.4, roofH - windowInset
        );
        actualGlassShape.lineTo(-halfL + 0.6, roofH - windowInset - 0.02);
        actualGlassShape.bezierCurveTo(
            -halfL + 0.2 + windowInset, roofH - 0.05,
            -halfL + 0.15 + windowInset, beltLine + 0.2,
            -halfL + 0.3 + windowInset, beltLine + windowInset
        );
        actualGlassShape.lineTo(halfL - 0.85 - windowInset, beltLine + windowInset);


        // Extrusion Settings
        const bodyExtrude = {
            depth: width,
            bevelEnabled: true,
            bevelSegments: 5,
            steps: 2,
            bevelSize: 0.05,
            bevelThickness: 0.05
        };

        const cabinWidth = width * 0.85;
        const glassExtrude = {
            depth: cabinWidth,
            bevelEnabled: true,
            bevelSegments: 3,
            steps: 2,
            bevelSize: 0.02,
            bevelThickness: 0.02
        };

        return {
            bodyGeom: new THREE.ExtrudeGeometry(bodyShape, bodyExtrude),
            glassGeom: new THREE.ExtrudeGeometry(actualGlassShape, glassExtrude),
            // We can add a "Pillars" geometry which is the full glassShape but with body material
            roofGeom: new THREE.ExtrudeGeometry(glassShape, { ...glassExtrude, depth: cabinWidth + 0.02 }),
        };

    }, [length, width, height]);

    // Target for headlights
    const [headlightTarget] = useState(() => {
        const o = new THREE.Object3D();
        o.position.set(20, 0, 0);
        return o;
    });

    return (
        <group>
            {/* Shadow Blob */}
            <mesh position={[0, 0, 0.02]}>
                <planeGeometry args={[length * 1.1, width * 1.1]} />
                <meshBasicMaterial color="#000000" transparent opacity={0.6} depthWrite={false} />
            </mesh>

            <group rotation={[Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
                 <primitive object={headlightTarget} />
            </group>

            {/* Car Body Group - Centered */}
            <group rotation={[Math.PI / 2, 0, 0]} scale={[1, 1, 1]}>
               <group position={[0, 0, -width/2]}>
                   {/* Body */}
                   <mesh geometry={bodyGeom}>
                        <meshPhysicalMaterial
                            color="#ffffff"
                            roughness={0.2}
                            metalness={0.1}
                            clearcoat={1.0}
                            clearcoatRoughness={0.05}
                            sheen={0.5}
                        />
                   </mesh>

                   {/* Pillars / Roof Frame (Black) */}
                   <mesh geometry={roofGeom} position={[0, 0, (width - (width*0.85))/2 - 0.01]}>
                        <meshStandardMaterial color="#111111" roughness={0.1} metalness={0.5} />
                   </mesh>

                    {/* Glass (Tinted) */}
                   <mesh geometry={glassGeom} position={[0, 0, (width - (width*0.85))/2]}>
                        <meshPhysicalMaterial
                            color="#111111"
                            roughness={0.0}
                            metalness={0.9}
                            transmission={0.2} // Dark glass
                            clearcoat={1.0}
                        />
                   </mesh>
               </group>
            </group>

            {/* Details that don't need complex rotation */}

            {/* Wheels */}
             <DetailedWheel position={[length * 0.36, width * 0.45, 0.38]} radius={0.38} side="left" />
             <DetailedWheel position={[length * 0.36, -width * 0.45, 0.38]} radius={0.38} side="right" />
             <DetailedWheel position={[-length * 0.36, width * 0.45, 0.38]} radius={0.38} side="left" />
             <DetailedWheel position={[-length * 0.36, -width * 0.45, 0.38]} radius={0.38} side="right" />

            {/* Lights */}
            <group position={[length/2 - 0.15, 0, height * 0.55]}>
                <CarLight position={[0, width * 0.35, 0]} color="#E0E0FF" type="head" target={headlightTarget} />
                <CarLight position={[0, -width * 0.35, 0]} color="#E0E0FF" type="head" target={headlightTarget} />
                {/* Grill Strip */}
                <mesh position={[0.05, 0, 0]}>
                    <boxGeometry args={[0.05, width * 0.5, 0.05]} />
                    <meshStandardMaterial color="#000" roughness={0.2} />
                </mesh>
                {/* Emblem */}
                <mesh position={[0.08, 0, 0]}>
                     <circleGeometry args={[0.04, 16]} />
                     <meshStandardMaterial color="#333" metalness={1.0} />
                </mesh>
            </group>

            {/* Taillights */}
             <group position={[-length/2 + 0.1, 0, height * 0.65]}>
                <CarLight position={[0, width * 0.35, 0]} color="#FF0000" type="tail" isBraking={isBraking} />
                <CarLight position={[0, -width * 0.35, 0]} color="#FF0000" type="tail" isBraking={isBraking} />
                {/* Light Bar */}
                <mesh position={[0, 0, 0]}>
                     <boxGeometry args={[0.05, width * 0.6, 0.05]} />
                     <meshStandardMaterial color="#500" emissive="#500" emissiveIntensity={isBraking ? 2 : 0.5} />
                </mesh>
            </group>

            {/* Sensor Suite */}
            <SensorSuite position={[length * 0.1, 0, height * 0.96]} />
            <SideSensor position={[length * 0.32, width/2, height * 0.6]} side="left" />
            <SideSensor position={[length * 0.32, -width/2, height * 0.6]} side="right" />

        </group>
    );
}

function DetailedWheel({ position, radius, side }) {
    const width = 0.28;
    const rimRadius = radius * 0.65;

    const wheelRot = [Math.PI/2, 0, 0]; // Standard for Torus

    return (
        <group position={position} rotation={side === 'right' ? [0, Math.PI, 0] : [0, 0, 0]}>
            {/* Tire (Torus) */}
             <mesh rotation={wheelRot}>
                <torusGeometry args={[radius - 0.06, 0.06, 16, 48]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
            </mesh>

            {/* Tire Tread (Cylinder) */}
            <mesh rotation={[0, 0, 0]}>
                 <cylinderGeometry args={[radius - 0.02, radius - 0.02, width - 0.05, 32]} />
                 <meshStandardMaterial color="#1a1a1a" roughness={0.9} />
            </mesh>

            {/* Rim (Cylinder) */}
            <mesh rotation={[0, 0, 0]}>
                <cylinderGeometry args={[rimRadius, rimRadius, width * 0.6, 32]} />
                <meshStandardMaterial color="#ccc" metalness={0.7} roughness={0.2} />
            </mesh>

            {/* Spokes (Box Cross) */}
            <group rotation={[Math.PI/2, 0, 0]}>
                 <mesh>
                     <boxGeometry args={[rimRadius*1.8, 0.05, 0.02]} />
                     <meshStandardMaterial color="#888" metalness={0.8} />
                 </mesh>
                 <mesh rotation={[0, Math.PI/2, 0]}>
                     <boxGeometry args={[rimRadius*1.8, 0.05, 0.02]} />
                     <meshStandardMaterial color="#888" metalness={0.8} />
                 </mesh>
                 {/* Hub Cap */}
                 <mesh position={[0, width*0.32 * (side==='left'?1:-1), 0]}>
                     <cylinderGeometry args={[0.05, 0.05, 0.02, 16]} />
                     <meshStandardMaterial color="#000" />
                 </mesh>
            </group>
        </group>
    )
}

function CarLight({ position, color, type, isBraking, target }) {
    const intensity = isBraking ? 4.0 : 1.0;

    return (
        <group position={position}>
            {/* Housing */}
            <mesh rotation={[0, Math.PI/2, 0]}>
                <boxGeometry args={[0.1, 0.15, 0.2]} />
                <meshStandardMaterial color="#333" />
            </mesh>
            {/* Lens */}
            <mesh position={[0.05, 0, 0]} rotation={[0, Math.PI/2, 0]}>
                 <planeGeometry args={[0.08, 0.18]} />
                 <meshStandardMaterial
                    color={color}
                    emissive={color}
                    emissiveIntensity={intensity}
                    toneMapped={false}
                 />
            </mesh>

            {type === 'head' && (
                <spotLight
                    color={color}
                    intensity={10}
                    distance={40}
                    angle={0.5}
                    penumbra={0.3}
                    castShadow
                    target={target}
                    position={[0.1, 0, 0]}
                />
            )}
             {isBraking && (
                <pointLight color="#ff0000" intensity={2} distance={5} />
            )}
        </group>
    )
}

function SensorSuite({ position }) {
    return (
        <group position={position}>
             {/* Base */}
             <mesh position={[0, 0, 0.02]}>
                 <boxGeometry args={[0.6, 0.4, 0.05]} />
                 <meshStandardMaterial color="#ddd" />
             </mesh>
             {/* Main Dome (Waymo Driver) */}
             <mesh position={[0, 0, 0.25]}>
                  <cylinderGeometry args={[0.12, 0.14, 0.35, 32]} />
                  <meshStandardMaterial color="#111" metalness={0.8} roughness={0.1} />
             </mesh>
             {/* Spinning LiDAR Graphic (Static but styled) */}
             <mesh position={[0, 0, 0.35]}>
                 <cylinderGeometry args={[0.125, 0.125, 0.1, 32]} />
                  <meshStandardMaterial color="#222" metalness={0.5} />
                  {/* We could animate rotation here if we had ref */}
             </mesh>
             <mesh position={[0, 0, 0.41]}>
                 <cylinderGeometry args={[0.13, 0.13, 0.01, 32]} />
                 <meshStandardMaterial color="#444" />
             </mesh>

             {/* Side Pucks on Roof Rack */}
             <mesh position={[-0.1, 0.25, 0.1]}>
                  <cylinderGeometry args={[0.06, 0.07, 0.15, 16]} />
                  <meshStandardMaterial color="#111" />
             </mesh>
             <mesh position={[-0.1, -0.25, 0.1]}>
                  <cylinderGeometry args={[0.06, 0.07, 0.15, 16]} />
                  <meshStandardMaterial color="#111" />
             </mesh>
        </group>
    )
}

function SideSensor({ position, side }) {
    return (
        <group position={position} rotation={[0, 0, side === 'left' ? 0.3 : -0.3]}>
            <mesh>
                <cylinderGeometry args={[0.06, 0.07, 0.12, 16]} />
                <meshStandardMaterial color="#111" metalness={0.8} />
            </mesh>
             <mesh position={[0, 0, 0.065]}>
                <sphereGeometry args={[0.06, 16, 16]} />
                <meshStandardMaterial color="#000" />
            </mesh>
        </group>
    )
}
