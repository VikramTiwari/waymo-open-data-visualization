import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Simple LCG (same as Rain)
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

export function Snow({ count = 5000 }) {
    const meshRef = useRef();

    const pointsGeometry = useMemo(() => {
        const rand = mulberry32(54321); // Different seed
        const positions = [];
        const velocities = []; // Store custom velocity data: [speed, driftX, driftY]
        const range = 100;
        const height = 50;

        for(let i=0; i<count; i++) {
             const x = (rand() - 0.5) * range;
             const y = (rand() - 0.5) * range;
             const z = rand() * height;

             positions.push(x, y, z);
             
             // Speed (slower than rain), Drift Amplitude
             // stored as: fallSpeed, driftOffset, driftSpeed
             velocities.push(
                 2 + rand() * 3,     // fall speed (2-5 m/s)
                 rand() * Math.PI * 2, // random starting phase
                 0.5 + rand() * 1.0   // drift speed
             );
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('aVelocity', new THREE.Float32BufferAttribute(velocities, 3));
        return geo;
    }, [count]);

    // Update Loop
    useFrame((state, delta) => {
        if (!meshRef.current) return;

        const posAttr = meshRef.current.geometry.attributes.position;
        const velAttr = meshRef.current.geometry.attributes.aVelocity;
        const count = posAttr.count;
        
        const time = state.clock.elapsedTime;

        for (let i = 0; i < count; i++) {
            let z = posAttr.getZ(i);
            let x = posAttr.getX(i);
            let y = posAttr.getY(i);
            
            const fallSpeed = velAttr.getX(i);
            const phase = velAttr.getY(i);
            const driftRate = velAttr.getZ(i);

            // Falling
            z -= fallSpeed * delta;

            // Drifting (gentle sway)
            x += Math.sin(time * driftRate + phase) * 2 * delta;
            y += Math.cos(time * driftRate + phase) * 2 * delta;

            // Reset if below ground
            if (z < 0) {
                 z = 40 + Math.random() * 10;
                 // Reset XY to stay within range somewhat? 
                 // Actually, let them drift. If they drift too far out, maybe reset?
                 // For now, simple Z reset is fine for the camera view.
            }

            posAttr.setXYZ(i, x, y, z);
        }
        posAttr.needsUpdate = true;
    });

    return (
        <points ref={meshRef} geometry={pointsGeometry}>
            <pointsMaterial 
                color="#ffffff" 
                size={0.15} 
                transparent 
                opacity={0.8} 
                depthWrite={false} 
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
}
