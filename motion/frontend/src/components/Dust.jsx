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

const vertexShader = `
  uniform float uTime;

  // Attributes
  attribute vec3 aVelocity; // vx, vy, vz

  void main() {
    // Current Position = Initial Position + Velocity * Time
    vec3 pos = position + aVelocity * uTime;

    // Wrapping
    // X: -50 to 50 (Range 100). Center 0.
    // To use mod(val, range), we shift to 0..range, mod, then shift back.

    float x = mod(pos.x + 50.0, 100.0) - 50.0;
    float y = mod(pos.y + 50.0, 100.0) - 50.0;

    // Z: 0 to 40 (Range 40).
    float z = mod(pos.z, 40.0);

    vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    // Size Attenuation
    // Standard PointsMaterial formula: size * ( scale / - mvPosition.z )
    // We'll just use a constant or simple attenuation.
    gl_PointSize = 4.0 * (10.0 / -mvPosition.z);
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    // Soft circle
    vec2 c = gl_PointCoord - vec2(0.5);
    float dist = length(c);
    if (dist > 0.5) discard;

    // Slight gradient for fluffiness
    float alpha = uOpacity * (1.0 - dist * 2.0);

    gl_FragColor = vec4(uColor, alpha);
  }
`;

export function Dust({ count = 3000 }) {
    const materialRef = useRef();

    const geometry = useMemo(() => {
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

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
        }
    });

    return (
        <points geometry={geometry}>
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={{
                    uTime: { value: 0 },
                    uColor: { value: new THREE.Color('#e6c288') },
                    uOpacity: { value: 0.6 }
                }}
                transparent={true}
                depthWrite={false}
                blending={THREE.NormalBlending}
            />
        </points>
    );
}
