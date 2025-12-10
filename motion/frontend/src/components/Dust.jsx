import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Simple LCG
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

export function Dust({ count = 3000 }) {
    const meshRef = useRef();

    const pointsGeometry = useMemo(() => {
        const rand = mulberry32(78901); 
        const positions = [];
        const velocities = []; 
        const range = 100;
        const height = 40;

        for(let i=0; i<count; i++) {
             const x = (rand() - 0.5) * range;
             const y = (rand() - 0.5) * range;
             const z = rand() * height;

             positions.push(x, y, z);
             
             // Dust moves more horizontally
             // stored as: vx, vy, vz (turbulence)
             velocities.push(
                 (rand() - 0.5) * 5, // vx
                 (rand() - 0.5) * 5, // vy
                 (rand() - 0.5) * 0.5 // vz (vertical drift)
             );
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('aVelocity', new THREE.Float32BufferAttribute(velocities, 3));
        return geo;
    }, [count]);

    useFrame((state, delta) => {
        if (!meshRef.current) return;

        const posAttr = meshRef.current.geometry.attributes.position;
        const velAttr = meshRef.current.geometry.attributes.aVelocity;
        const count = posAttr.count;
        
        for (let i = 0; i < count; i++) {
            let x = posAttr.getX(i);
            let y = posAttr.getY(i);
            let z = posAttr.getZ(i);
            
            const vx = velAttr.getX(i);
            const vy = velAttr.getY(i);
            const vz = velAttr.getZ(i);

            x += vx * delta;
            y += vy * delta;
            z += vz * delta;

            // Loop smoothly around boundaries (simple wrap)
            if (z < 0) z = 40;
            if (z > 40) z = 0;
            if (x < -50) x = 50;
            if (x > 50) x = -50;
            if (y < -50) y = 50;
            if (y > 50) y = -50;

            posAttr.setXYZ(i, x, y, z);
        }
        posAttr.needsUpdate = true;
    });

    return (
        <points ref={meshRef} geometry={pointsGeometry}>
            <pointsMaterial 
                color="#e6c288" 
                size={0.15} 
                transparent 
                opacity={0.6} 
                depthWrite={false} 
                blending={THREE.NormalBlending}
            />
        </points>
    );
}
