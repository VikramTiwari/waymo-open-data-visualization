import React, { useMemo } from 'react';
import * as THREE from 'three';

export function CyclistAsset({ color = '#34A853' }) {
    // High-fidelity Cyclist
    // Using Cylinders for frame tubes instead of boxes.
    
    const wheelRadius = 0.35;
    const wheelDist = 1.05;
    const handleHeight = 1.0;
    const seatHeight = 0.95;
    
    // Material re-use
    const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.3, metalness: 0.8 }), []);
    const skinMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#f0d5be' }), []);
    const clothesMat = useMemo(() => new THREE.MeshStandardMaterial({ color: color }), []);
    const darkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#222' }), []);

    return (
        <group position={[0, 0, 0]}> 
             {/* === Bicycle === */}
             <group position={[0, 0, wheelRadius]}>
                {/* Wheels */}
                <Wheel x={wheelDist / 2} />
                <Wheel x={-wheelDist / 2} />
                
                {/* Frame Structure - Cylinders for tubes */}
                <group position={[0, 0, 0]}>
                    {/* Bottom Tube (Diagonal down) */}
                    <Tube start={[0.25, 0, 0.75]} end={[wheelDist * 0.35, 0, 0.1]} thickness={0.04} material={frameMat} />
                    
                    {/* Seat Tube (Vertical-ish) */}
                    <Tube start={[0.25, 0, 0.75]} end={[-0.15, 0, 0.1]} thickness={0.04} material={frameMat} />
                    
                    {/* Top Tube (Horizontal) */}
                    <Tube start={[0.25, 0, 0.75]} end={[-0.2, 0, 0.75]} thickness={0.04} material={frameMat} />
                    
                    {/* Head Tube */}
                    <Tube start={[0.25, 0, 0.8]} end={[0.25, 0, 0.6]} thickness={0.05} material={frameMat} />
                    
                    {/* Fork */}
                    <Tube start={[0.25, 0, 0.6]} end={[wheelDist/2, 0, 0]} thickness={0.03} material={frameMat} />
                    
                    {/* Seat Stays */}
                    <Tube start={[-0.2, 0, 0.75]} end={[-wheelDist/2, 0, 0]} thickness={0.02} material={frameMat} />
                    
                    {/* Chain Stays */}
                    <Tube start={[-0.15, 0, 0.1]} end={[-wheelDist/2, 0, 0]} thickness={0.02} material={frameMat} />
                    
                     {/* Seat Post + Seat */}
                    <Tube start={[-0.2, 0, 0.75]} end={[-0.22, 0, seatHeight - wheelRadius]} thickness={0.03} material={frameMat} />
                     <mesh position={[-0.22, 0, seatHeight - wheelRadius]}>
                         <boxGeometry args={[0.25, 0.15, 0.05]} />
                         <meshStandardMaterial color="#111" />
                    </mesh>
                </group>
                
                {/* Handlebars */}
                 {/* Stem */}
                <Tube start={[0.25, 0, 0.8]} end={[0.3, 0, handleHeight - wheelRadius - 0.05]} thickness={0.03} material={frameMat} />
                <mesh position={[0.3, 0, handleHeight - wheelRadius]} rotation={[0, 0, Math.PI / 2]}>
                     <cylinderGeometry args={[0.02, 0.02, 0.6, 8]} />
                     <meshStandardMaterial color="#333" />
                </mesh>
             </group>
             
             {/* === Rider (Seated) === */}
             <group position={[-0.22, 0, seatHeight]}> 
                {/* Legs (Bent) */}
                {/* Thighs */}
                <mesh position={[0.15, 0.1, -0.05]} rotation={[0, 0.2, 0]}> 
                    <boxGeometry args={[0.45, 0.12, 0.12]} />
                    <primitive object={darkMat} />
                </mesh>
                 <mesh position={[0.15, -0.1, -0.05]} rotation={[0, 0.2, 0]}> 
                    <boxGeometry args={[0.45, 0.12, 0.12]} />
                    <primitive object={darkMat} />
                </mesh>
                
                {/* Shins (Vertical-ish) */}
                <mesh position={[0.4, 0.1, -0.3]} rotation={[0, -0.3, 0]}>
                     <boxGeometry args={[0.4, 0.1, 0.1]} />
                     <primitive object={darkMat} />
                </mesh>
                 <mesh position={[0.4, -0.1, -0.3]} rotation={[0, -0.3, 0]}>
                     <boxGeometry args={[0.4, 0.1, 0.1]} />
                     <primitive object={darkMat} />
                </mesh>

                {/* Body (Leaning forward) */}
                <mesh rotation={[0, 0.5, 0]} position={[0.15, 0, 0.35]}> 
                    <boxGeometry args={[0.25, 0.35, 0.6]} />
                    <primitive object={clothesMat} />
                </mesh>
                
                {/* Arms (Reaching) */}
                 <mesh position={[0.45, 0.2, 0.45]} rotation={[0, 0.6, -0.3]}>
                      <boxGeometry args={[0.45, 0.08, 0.08]} />
                      <primitive object={clothesMat} />
                 </mesh>
                 <mesh position={[0.45, -0.2, 0.45]} rotation={[0, 0.6, 0.3]}>
                      <boxGeometry args={[0.45, 0.08, 0.08]} />
                      <primitive object={clothesMat} />
                 </mesh>

                 {/* Head */}
                <mesh position={[0.35, 0, 0.75]}>
                    <sphereGeometry args={[0.12, 16, 16]} />
                    <primitive object={skinMat} />
                </mesh>
                {/* Helmet */}
                <mesh position={[0.35, 0, 0.8]}>
                    <sphereGeometry args={[0.13, 16, 16, 0, Math.PI * 2, 0, Math.PI/2]} />
                     <primitive object={clothesMat} />
                </mesh>
             </group>
        </group>
    );
}

// Helper to draw a tube between two points
function Tube({ start, end, thickness, material }) {
    const startVec = new THREE.Vector3(...start);
    const endVec = new THREE.Vector3(...end);
    const direction = new THREE.Vector3().subVectors(endVec, startVec);
    const length = direction.length();
    
    // Position is midpoint
    const position = new THREE.Vector3().addVectors(startVec, endVec).multiplyScalar(0.5);
    
    // Orientation
    const quaternion = new THREE.Quaternion();
    quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize());

    return (
        <mesh position={position} quaternion={quaternion}>
            <cylinderGeometry args={[thickness, thickness, length, 8]} />
            <primitive object={material} />
        </mesh>
    );
}

function Wheel({ x }) {
    return (
        <group position={[x, 0, 0]}>
             <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.35, 0.02, 32, 64]} /> {/* Smoother torus */}
                <meshStandardMaterial color="#111" />
            </mesh>
            {/* Rim */}
             <mesh rotation={[Math.PI / 2, 0, 0]}>
                <torusGeometry args={[0.33, 0.015, 16, 64]} />
                <meshStandardMaterial color="#888" metalness={0.8} roughness={0.2} />
            </mesh>
             {/* Spokes - Disk for simplicity but transparent */}
            <mesh rotation={[Math.PI / 2, 0, 0]}>
                 <cylinderGeometry args={[0.33, 0.33, 0.01, 16]} />
                 <meshStandardMaterial color="#aaa" transparent opacity={0.15} />
            </mesh>
        </group>
    )
}
