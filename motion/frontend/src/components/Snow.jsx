import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

const vertexShader = `
  uniform float uTime;
  uniform float uHeight;

  attribute vec3 aVelocity; // x=speed, y=driftPhase, z=driftSpeed

  void main() {
    float fallSpeed = aVelocity.x;
    float phase = aVelocity.y;
    float driftRate = aVelocity.z;

    // Fall Logic
    float fallDist = uTime * fallSpeed;
    float currentZ = position.z - fallDist;
    float finalZ = mod(currentZ, uHeight);

    // Sway Logic
    float swayX = sin(uTime * driftRate + phase) * 2.0;
    float swayY = cos(uTime * driftRate + phase) * 2.0;

    vec3 transformed = vec3(
        position.x + swayX,
        position.y + swayY,
        finalZ
    );

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    gl_PointSize = 4.0; // Fixed size in pixels, or attenuate
    // Size attenuation approximation
    gl_PointSize *= (20.0 / -mvPosition.z);
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    // Round particles
    vec2 coord = gl_PointCoord - vec2(0.5);
    if(length(coord) > 0.5) discard;

    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

export function Snow({ count = 5000 }) {
    const materialRef = useRef();
    const height = 50;

    const geometry = useMemo(() => {
        const rand = mulberry32(54321);
        const positions = [];
        const velocities = [];
        const range = 100;

        for(let i=0; i<count; i++) {
             const x = (rand() - 0.5) * range;
             const y = (rand() - 0.5) * range;
             const z = rand() * height;

             positions.push(x, y, z);
             
             // [speed, driftPhase, driftRate]
             velocities.push(
                 2 + rand() * 3,      // fall speed
                 rand() * Math.PI * 2,// phase
                 0.5 + rand() * 1.0   // drift rate
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
                    uHeight: { value: height },
                    uColor: { value: new THREE.Color('#ffffff') },
                    uOpacity: { value: 0.8 }
                }}
                transparent={true}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
            />
        </points>
    );
}
