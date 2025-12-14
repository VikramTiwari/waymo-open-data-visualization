import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

// Shader code
const vertexShader = `
  uniform float uTime;
  uniform float uHeight;

  attribute float aSpeed;
  attribute float aOffset;

  void main() {
    // Calculate the anchor position (top of the drop)
    float fallDist = uTime * aSpeed;
    float currentZ = position.z - fallDist;

    // Wrap around height
    // We add uHeight to ensure positive modulus behavior if needed,
    // though GLSL mod handles it.
    // We want z to go from uHeight down to 0.
    // As uTime increases, currentZ decreases.
    // mod(currentZ, uHeight) will produce nice wrapping.
    float wrappedZ = mod(currentZ, uHeight);

    // Apply the vertex offset (length of the drop)
    float finalZ = wrappedZ + aOffset;

    vec3 transformed = vec3(position.x, position.y, finalZ);

    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = `
  uniform vec3 uColor;
  uniform float uOpacity;

  void main() {
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

// Simple LCG
function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
}

export function Rain({ count = 10000 }) {
    const materialRef = useRef();
    const height = 50;

    const geometry = useMemo(() => {
        const rand = mulberry32(12345);
        const positions = [];
        const speeds = [];
        const offsets = []; // 0 or -length
        const range = 100;

        for(let i=0; i<count; i++) {
             const x = (rand() - 0.5) * range;
             const y = (rand() - 0.5) * range;
             const z = rand() * height;
             const s = 15 + rand() * 5;

             // Vertex 1 (Top)
             positions.push(x, y, z);
             speeds.push(s);
             offsets.push(0);

             // Vertex 2 (Bottom)
             positions.push(x, y, z); // Same anchor
             speeds.push(s);
             offsets.push(-0.5); // Length 0.5m down
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('aSpeed', new THREE.Float32BufferAttribute(speeds, 1));
        geo.setAttribute('aOffset', new THREE.Float32BufferAttribute(offsets, 1));
        return geo;
    }, [count]);

    useFrame((state) => {
        if (materialRef.current) {
            materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
        }
    });

    return (
        <lineSegments geometry={geometry}>
            <shaderMaterial
                ref={materialRef}
                vertexShader={vertexShader}
                fragmentShader={fragmentShader}
                uniforms={{
                    uTime: { value: 0 },
                    uHeight: { value: height },
                    uColor: { value: new THREE.Color('#aaaaaa') },
                    uOpacity: { value: 0.3 }
                }}
                transparent={true}
                depthWrite={false}
            />
        </lineSegments>
    );
}
