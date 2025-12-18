import React, { useMemo, useState } from 'react';
import * as THREE from 'three';

// Define reusable geometries outside to avoid recreation
const WHEEL_TIRE_GEO = new THREE.TorusGeometry(1, 0.06, 16, 48);
const WHEEL_TREAD_GEO = new THREE.CylinderGeometry(1, 1, 1, 32);
const WHEEL_RIM_GEO = new THREE.CylinderGeometry(1, 1, 1, 32);
const SPOKE_H_GEO = new THREE.BoxGeometry(1, 0.05, 0.02);
const SPOKE_V_GEO = new THREE.BoxGeometry(1, 0.05, 0.02);
const HUB_CAP_GEO = new THREE.CylinderGeometry(0.05, 0.05, 0.02, 16);

// Lights
const LIGHT_HOUSING_GEO = new THREE.BoxGeometry(0.1, 0.15, 0.2);
const LIGHT_LENS_GEO = new THREE.PlaneGeometry(0.08, 0.18);
const GRILL_STRIP_GEO = new THREE.BoxGeometry(0.05, 1, 0.05); // width dynamic
const EMBLEM_GEO = new THREE.CircleGeometry(0.04, 16);
const LIGHT_BAR_GEO = new THREE.BoxGeometry(0.05, 1, 0.05); // width dynamic

// Sensors
const SENSOR_BASE_GEO = new THREE.BoxGeometry(0.6, 0.4, 0.05);
const MAIN_DOME_GEO = new THREE.CylinderGeometry(0.12, 0.14, 0.35, 32);
const LIDAR_GEO = new THREE.CylinderGeometry(0.125, 0.125, 0.1, 32);
const LIDAR_TOP_GEO = new THREE.CylinderGeometry(0.13, 0.13, 0.01, 32);
const PUCK_GEO = new THREE.CylinderGeometry(0.06, 0.07, 0.15, 16);
const SIDE_SENSOR_BODY_GEO = new THREE.CylinderGeometry(0.06, 0.07, 0.12, 16);
const SIDE_SENSOR_DOME_GEO = new THREE.SphereGeometry(0.06, 16, 16);

// Materials
const TIRE_MAT = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.8 });
const TREAD_MAT = new THREE.MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.9 });
const RIM_MAT = new THREE.MeshStandardMaterial({ color: "#ccc", metalness: 0.7, roughness: 0.2 });
const SPOKE_MAT = new THREE.MeshStandardMaterial({ color: "#888", metalness: 0.8 });
const BLACK_MAT = new THREE.MeshStandardMaterial({ color: "#000" });
const HOUSING_MAT = new THREE.MeshStandardMaterial({ color: "#333" });
const METAL_MAT = new THREE.MeshStandardMaterial({ color: "#333", metalness: 1.0 });
const SENSOR_BASE_MAT = new THREE.MeshStandardMaterial({ color: "#ddd" });
const DOME_MAT = new THREE.MeshStandardMaterial({ color: "#111", metalness: 0.8, roughness: 0.1 });
const LIDAR_MAT = new THREE.MeshStandardMaterial({ color: "#222", metalness: 0.5 });
const DARK_GREY_MAT = new THREE.MeshStandardMaterial({ color: "#444" });
const PUCK_MAT = new THREE.MeshStandardMaterial({ color: "#111" });

export function WaymoCar({ dims = [4.68, 2.0, 1.56], isBraking = false }) {
    // Default Waymo I-Pace dimensions: L: 4.68, W: 2.0, H: 1.56
    const [length, width, height] = dims;
    const wheelRadius = 0.60; // Requested big wheels

    const { bodyGeom, glassGeom, roofGeom } = useMemo(() => {
        const halfL = length / 2;
        const groundClearance = 0.32; // Lifted for 0.6m wheels
        const wheelBase = length * 0.6;
        const wheelPosFwd = wheelBase / 2;
        const wheelPosRear = -wheelBase / 2;
        // wheelRadius is now from outer scope
        const wellRadius = wheelRadius * 1.1; // Clearance
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

    }, [length, width, height, wheelRadius]);

    // Target for headlights
    const [headlightTarget] = useState(() => {
        const o = new THREE.Object3D();
        o.position.set(20, 0, 0);
        return o;
    });

    return (
        <group position={[0, 0, -height / 2]}>
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
             <DetailedWheel position={[length * 0.3, width * 0.45, wheelRadius]} radius={wheelRadius} side="left" />
             <DetailedWheel position={[length * 0.3, -width * 0.45, wheelRadius]} radius={wheelRadius} side="right" />
             <DetailedWheel position={[-length * 0.3, width * 0.45, wheelRadius]} radius={wheelRadius} side="left" />
             <DetailedWheel position={[-length * 0.3, -width * 0.45, wheelRadius]} radius={wheelRadius} side="right" />

            {/* Lights */}
            <group position={[length/2 - 0.05, 0, height * 0.42]}>
                <CarLight position={[0, width * 0.35, 0]} color="#E0E0FF" type="head" target={headlightTarget} />
                <CarLight position={[0, -width * 0.35, 0]} color="#E0E0FF" type="head" target={headlightTarget} />
                {/* Grill Strip */}
                <mesh position={[0.05, 0, 0]} geometry={GRILL_STRIP_GEO} scale={[1, width * 0.5, 1]} material={BLACK_MAT} />
                {/* Emblem */}
                <mesh position={[0.08, 0, 0]} geometry={EMBLEM_GEO} material={METAL_MAT} />
            </group>

            {/* Taillights */}
             <group position={[-length/2 - 0.05, 0, height * 0.55]} rotation={[0, Math.PI, 0]}>
                <CarLight position={[0, width * 0.35, 0]} color="#FF0000" type="tail" isBraking={isBraking} />
                <CarLight position={[0, -width * 0.35, 0]} color="#FF0000" type="tail" isBraking={isBraking} />
                {/* Light Bar */}
                <mesh position={[0, 0, 0]} geometry={LIGHT_BAR_GEO} scale={[1, width * 0.6, 1]}>
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
    const isRight = side === 'right';

    // We can't reuse geometries with different args unless we scale them.
    // The args used above are:
    // Torus: radius - 0.06, 0.06...
    // Cylinder: radius - 0.02...
    // These depend on radius. But radius is passed in.
    // However, WaymoCar usually uses same radius.
    // If we want to optimize properly, we should scale a unit geometry.

    // Let's use scale for optimization.
    // WHEEL_TIRE_GEO radius is 1. We want (radius - 0.06).
    // This is tricky because tube radius (0.06) shouldn't scale with main radius if we want fixed tube thickness.
    // So we'll stick to creating geometry if radius varies dynamically, BUT here radius is likely constant for the car.
    // Actually, `radius` comes from `wheelRadius` in `WaymoCar`. `wheelRadius` is `0.60` constant.
    // So we can assume constant radius for now, OR create specific Geoms for that radius.

    // For now, let's keep the existing logic inside DetailedWheel if we want perfect accuracy,
    // OR pre-calculate for radius=0.60.
    // Since `wheelRadius` is hardcoded to 0.60 in WaymoCar, we can optimize for that specific size.

    // But let's be safe and use `useMemo` per wheel if we really want to avoid recreation,
    // OR since it's only 4 wheels, it's not a huge deal.
    // The main issue was `WaymoCar` re-rendering causing 4x geometry recreation.
    // Since `WaymoCar` is now memoized by parent, it's better.
    // But `isBraking` causes re-render of `WaymoCar`.

    // So we should memoize DetailedWheel.

    return useMemo(() => (
        <group position={position} rotation={isRight ? [Math.PI, 0, 0] : [0, 0, 0]}>
            {/* Tire (Torus) - XZ Plane */}
             {/* Fallback to local geometry for Torus to keep look correct, but memoize it */}
             <mesh rotation={[Math.PI/2, 0, 0]}>
                <torusGeometry args={[radius - 0.06, 0.06, 16, 48]} />
                <meshStandardMaterial color="#1a1a1a" roughness={0.8} />
            </mesh>

            {/* Tire Tread (Cylinder) - Y Axis */}
            <mesh geometry={WHEEL_TREAD_GEO} scale={[radius - 0.02, width - 0.05, radius - 0.02]} material={TREAD_MAT} />

            {/* Rim (Cylinder) - Y Axis */}
            <mesh geometry={WHEEL_RIM_GEO} scale={[rimRadius, width * 0.6, rimRadius]} material={RIM_MAT} />

            {/* Spokes (Box Cross) - XZ Plane */}
            <group position={[0, width * 0.2, 0]}>
                 {/* Horizontal Spoke (Along X) */}
                 <mesh geometry={SPOKE_H_GEO} scale={[rimRadius*1.8, 1, 1]} material={SPOKE_MAT} />
                 {/* Vertical Spoke (Along Z) */}
                 <mesh rotation={[0, Math.PI/2, 0]} geometry={SPOKE_V_GEO} scale={[rimRadius*1.8, 1, 1]} material={SPOKE_MAT} />
            </group>

             {/* Hub Cap - Center of Face */}
             <mesh position={[0, width * 0.25, 0]} rotation={[Math.PI/2, 0, 0]} geometry={HUB_CAP_GEO} material={BLACK_MAT} />
        </group>
    ), [position, radius, isRight, rimRadius, width]);
}

function CarLight({ position, color, type, isBraking, target }) {
    const intensity = isBraking ? 4.0 : 1.0;

    return (
        <group position={position}>
            {/* Housing */}
            <mesh rotation={[0, Math.PI/2, 0]} geometry={LIGHT_HOUSING_GEO} material={HOUSING_MAT} />
            {/* Lens */}
            <mesh position={[0.05, 0, 0]} rotation={[0, Math.PI/2, 0]} geometry={LIGHT_LENS_GEO}>
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
             <mesh position={[0, 0, 0.02]} geometry={SENSOR_BASE_GEO} material={SENSOR_BASE_MAT} />
             {/* Main Dome (Waymo Driver) */}
             <mesh position={[0, 0, 0.25]} rotation={[Math.PI/2, 0, 0]} geometry={MAIN_DOME_GEO} material={DOME_MAT} />
             {/* Spinning LiDAR Graphic (Static but styled) */}
             <mesh position={[0, 0, 0.35]} rotation={[Math.PI/2, 0, 0]} geometry={LIDAR_GEO} material={LIDAR_MAT} />
             <mesh position={[0, 0, 0.41]} rotation={[Math.PI/2, 0, 0]} geometry={LIDAR_TOP_GEO} material={DARK_GREY_MAT} />

             {/* Side Pucks on Roof Rack */}
             <mesh position={[-0.1, 0.25, 0.1]} rotation={[Math.PI/2, 0, 0]} geometry={PUCK_GEO} material={PUCK_MAT} />
             <mesh position={[-0.1, -0.25, 0.1]} rotation={[Math.PI/2, 0, 0]} geometry={PUCK_GEO} material={PUCK_MAT} />
        </group>
    )
}

function SideSensor({ position, side }) {
    return (
        <group position={position} rotation={[0, 0, side === 'left' ? 0.3 : -0.3]}>
            <mesh geometry={SIDE_SENSOR_BODY_GEO} material={DOME_MAT} />
             <mesh position={[0, 0, 0.065]} geometry={SIDE_SENSOR_DOME_GEO} material={BLACK_MAT} />
        </group>
    )
}
