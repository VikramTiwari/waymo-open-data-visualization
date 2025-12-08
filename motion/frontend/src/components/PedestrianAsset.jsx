import React, { useRef } from 'react';

export function PedestrianAsset({ color = '#4285F4' }) {
    // Mannequin style:
    // H: ~1.75m
    const torsoHeight = 0.5;
    const legHeight = 0.85;
    const headSize = 0.22;
    const shoulderWidth = 0.45;
    
    return (
        <group position={[0, 0, 0]}>
            {/* === Legs === */}
            <group position={[0, 0, legHeight / 2]}>
                {/* Left Leg */}
                <mesh position={[-0.1, 0, 0]}>
                    <boxGeometry args={[0.12, 0.12, legHeight]} />
                    <meshStandardMaterial color="#333" /> {/* Pants */}
                </mesh>
                 {/* Right Leg */}
                 <mesh position={[0.1, 0, 0]}>
                    <boxGeometry args={[0.12, 0.12, legHeight]} />
                    <meshStandardMaterial color="#333" />
                </mesh>
            </group>

            {/* === Torso === */}
            <mesh position={[0, 0, legHeight + torsoHeight / 2]}>
                <boxGeometry args={[0.35, 0.2, torsoHeight]} />
                <meshStandardMaterial color={color} /> {/* Shirt */}
            </mesh>

            {/* === Shoulders / Arms === */}
            {/* Simple blocky arms hanging down */}
            <mesh position={[-0.24, 0, legHeight + torsoHeight * 0.8 - 0.3]}>
                 <boxGeometry args={[0.1, 0.1, 0.6]} />
                 <meshStandardMaterial color={color} />
            </mesh>
             <mesh position={[0.24, 0, legHeight + torsoHeight * 0.8 - 0.3]}>
                 <boxGeometry args={[0.1, 0.1, 0.6]} />
                 <meshStandardMaterial color={color} />
            </mesh>

            {/* === Head === */}
            <mesh position={[0, 0, legHeight + torsoHeight + headSize / 2]}>
                <sphereGeometry args={[headSize / 2, 16, 16]} />
                <meshStandardMaterial color="#f0d5be" />
            </mesh>
        </group>
    );
}
