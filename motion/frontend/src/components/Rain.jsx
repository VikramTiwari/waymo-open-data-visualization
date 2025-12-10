import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Simple LCG for deterministic random numbers
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

export function Rain({ count = 10000 }) {
    const meshRef = useRef();

    // Use deterministic random so it's pure

    const linesGeometry = useMemo(() => {
        const rand = mulberry32(12345); // Seed
        const positions = [];
        const speeds = [];
        const range = 100;
        const height = 50;

        for(let i=0; i<count; i++) {
             const x = (rand() - 0.5) * range;
             const y = (rand() - 0.5) * range;
             const z = rand() * height;

             // Top point
             positions.push(x, y, z);
             // Bottom point (length 0.5m)
             positions.push(x, y, z - 0.5);

             // Speed
             const s = 15 + rand() * 5;
             speeds.push(s, s);
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speeds, 1));
        return geo;
    }, [count]);

    // Update Loop
    useFrame((state, delta) => {
        if (!meshRef.current) return;

        const posAttr = meshRef.current.geometry.attributes.position;
        const speedAttr = meshRef.current.geometry.attributes.aSpeed;
        const count = posAttr.count / 2; // 2 verts per line

        for (let i = 0; i < count; i++) {
            // Indices
            const idx1 = i * 2;
            const idx2 = i * 2 + 1;

            let zTop = posAttr.getZ(idx1);
            let zBot = posAttr.getZ(idx2);
            const speed = speedAttr.getX(idx1); // stored in x

            const drop = speed * delta;

            zTop -= drop;
            zBot -= drop;

            // Reset if below ground
            if (zTop < 0) {
                 // Non-deterministic random here is fine (it's in effect/event loop),
                 // but for strictness we could use a stateful RNG ref.
                 // However, useFrame is an effect, so Math.random is allowed.
                 zTop = 30 + Math.random() * 10;
                 zBot = zTop - 0.5;
            }

            posAttr.setZ(idx1, zTop);
            posAttr.setZ(idx2, zBot);
        }
        posAttr.needsUpdate = true;
    });

    return (
        <lineSegments ref={meshRef} geometry={linesGeometry}>
            <lineBasicMaterial color="#aaaaaa" transparent opacity={0.3} depthWrite={false} />
        </lineSegments>
    );
}
