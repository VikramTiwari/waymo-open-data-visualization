import React from 'react';

export function WaymoCar({ dims = [4.68, 2.0, 1.56] }) {
    // Default Waymo I-Pace dimensions: Length 4.68m, Width 2.0m, Height 1.56m
    const [L, W, H] = dims;
    
    // Proportions for the I-PACE
    const groundClearance = 0.2;
    const wheelRadius = 0.35;
    const wheelWidth = 0.25;
    const chassisHeight = 0.6; // Main body height (exclude cabin)
    const cabinHeight = 0.55;
    
    // Color Palette
    const BODY_COLOR = "#FFFFFF"; // Waymo White
    const WINDOW_COLOR = "#111111";
    const SENSOR_COLOR = "#1A1A1A"; // Dark Grey/Black for sensors
    const TIRE_COLOR = "#1f1f1f";
    const RIM_COLOR = "#888888";
    
    return (
        <group position={[0, 0, -H / 2]}>
            {/* === Main Body (Chassis) === */}
            {/* Lower Body */}
            <mesh position={[0, 0, groundClearance + chassisHeight / 2]} castShadow receiveShadow>
                <boxGeometry args={[L, W * 0.98, chassisHeight]} />
                <meshStandardMaterial color={BODY_COLOR} />
            </mesh>

            {/* Front Bumper/Nose Area */}
            <mesh position={[L / 2, 0, groundClearance + chassisHeight * 0.4]}>
                <boxGeometry args={[0.2, W * 0.95, chassisHeight * 0.6]} />
                <meshStandardMaterial color={BODY_COLOR} />
            </mesh>
            
            {/* === Cabin (Greenhouse) === */}
            {/* We cheat a bit with a smaller box for the cabin to simulate the "taper" */}
            <mesh position={[-0.2, 0, groundClearance + chassisHeight + cabinHeight / 2]}>
                <boxGeometry args={[L * 0.55, W * 0.85, cabinHeight]} />
                <meshStandardMaterial color={WINDOW_COLOR} roughness={0.1} metalness={0.8} />
            </mesh>
            
            {/* === Wheels === */}
            <Wheel x={L * 0.35} y={W / 2} z={wheelRadius} radius={wheelRadius} width={wheelWidth} color={TIRE_COLOR} rimColor={RIM_COLOR} />
            <Wheel x={L * 0.35} y={-W / 2} z={wheelRadius} radius={wheelRadius} width={wheelWidth} color={TIRE_COLOR} rimColor={RIM_COLOR} />
            <Wheel x={-L * 0.35} y={W / 2} z={wheelRadius} radius={wheelRadius} width={wheelWidth} color={TIRE_COLOR} rimColor={RIM_COLOR} />
            <Wheel x={-L * 0.35} y={-W / 2} z={wheelRadius} radius={wheelRadius} width={wheelWidth} color={TIRE_COLOR} rimColor={RIM_COLOR} />

            {/* === Waymo Sensor Suite === */}
            
            {/* 1. Main LiDAR Dome (The "Hat") */}
            <group position={[-0.2, 0, groundClearance + chassisHeight + cabinHeight]}>
                {/* Base Stalk */}
                <mesh position={[0, 0, 0.05]}>
                    <cylinderGeometry args={[0.15, 0.18, 0.1, 32]} />
                    <meshStandardMaterial color={BODY_COLOR} />
                </mesh>
                {/* The Dome */}
                <mesh position={[0, 0, 0.2]}>
                     <cylinderGeometry args={[0.22, 0.22, 0.25, 32]} />
                     <meshStandardMaterial color={SENSOR_COLOR} />
                </mesh>
                {/* Spinning Logic (Visual only) */}
                <mesh position={[0, 0, 0.35]}>
                    <cylinderGeometry args={[0.23, 0.23, 0.05, 32]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
                {/* Waymo Logo placeholder (White ring) */}
                <mesh position={[0, 0, 0.12]} rotation={[Math.PI/2, 0, 0]}>
                    <torusGeometry args={[0.23, 0.01, 16, 100]} />
                    <meshStandardMaterial color="#ffffff" emissive="#ffffff" />
                </mesh>
            </group>

            {/* 2. Perimeter Sensors (Front Fenders) - The "Ears" */}
            <SensorPod x={L * 0.38} y={W * 0.48} z={groundClearance + chassisHeight * 0.85} rotation={[0, 0, -0.4]} color={SENSOR_COLOR} />
            <SensorPod x={L * 0.38} y={-W * 0.48} z={groundClearance + chassisHeight * 0.85} rotation={[0, 0, 0.4]} color={SENSOR_COLOR} />

            {/* 3. Rear Roof Sensors - The small pucks */}
            <SensorPod x={-L * 0.28} y={W * 0.4} z={groundClearance + chassisHeight + cabinHeight * 0.9} scale={0.6} color={SENSOR_COLOR} />
            <SensorPod x={-L * 0.28} y={-W * 0.4} z={groundClearance + chassisHeight + cabinHeight * 0.9} scale={0.6} color={SENSOR_COLOR} />

            {/* 4. Front Grille Sensor */}
            <mesh position={[L / 2 + 0.1, 0, groundClearance + chassisHeight * 0.5]}>
                <boxGeometry args={[0.05, 0.4, 0.2]} />
                <meshStandardMaterial color={SENSOR_COLOR} />
            </mesh>

            {/* === Lights === */}
            {/* Headlights */}
            <Light x={L / 2} y={W * 0.35} z={groundClearance + chassisHeight * 0.65} color="#E0E0FF" />
            <Light x={L / 2} y={-W * 0.35} z={groundClearance + chassisHeight * 0.65} color="#E0E0FF" />
            
            {/* Taillights */}
            <Light x={-L / 2} y={W * 0.35} z={groundClearance + chassisHeight * 0.7} color="#FF0000" intensity={0.5} />
            <Light x={-L / 2} y={-W * 0.35} z={groundClearance + chassisHeight * 0.7} color="#FF0000" intensity={0.5} />
            
        </group>
    );
}

function Wheel({ x, y, z, radius, width, color, rimColor }) {
    return (
        <group position={[x, y, z]}>
            {/* Tire */}
            <mesh>
                <cylinderGeometry args={[radius, radius, width, 32]} />
                <meshStandardMaterial color={color} roughness={0.8} />
            </mesh>
            {/* Rim */}
            <mesh position={[0, -0.01, 0]} rotation={[0, 0, 0]}>  {/* Slightly inset */}
                 <cylinderGeometry args={[radius * 0.6, radius * 0.6, width * 1.05, 16]} />
                 <meshStandardMaterial color={rimColor} metalness={0.6} roughness={0.2} />
            </mesh>
        </group>
    );
}

function SensorPod({ x, y, z, rotation = [0, 0, 0], scale = 1.0, color }) {
    return (
        <group position={[x, y, z]} rotation={rotation} scale={scale}>
            <mesh>
                 <cylinderGeometry args={[0.1, 0.12, 0.15, 16]} />
                 <meshStandardMaterial color={color} />
            </mesh>
             <mesh position={[0, 0.08, 0]}>
                 <cylinderGeometry args={[0.1, 0.1, 0.05, 16]} />
                 <meshStandardMaterial color="#111" />
            </mesh>
        </group>
    )
}

function Light({ x, y, z, color, intensity = 1.0 }) {
    return (
        <mesh position={[x, y, z]}>
            <boxGeometry args={[0.05, 0.25, 0.1]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} />
        </mesh>
    );
}
