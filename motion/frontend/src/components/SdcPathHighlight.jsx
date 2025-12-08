import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export function SdcPathHighlight({ sdcState, frameRef }) {
    const { pathGeometry, totalSamples } = useMemo(() => {
        if (!sdcState) return { pathGeometry: null, totalSamples: 0 };
        
        const points = sdcState.trajectory.map(p => new THREE.Vector3(p.x, p.y, p.zBox));

        if (points.length < 2) return { pathGeometry: null, totalSamples: 0 };

        // Optimization: Use raw points directly, similar to RoadGraph
        const width = 2.4; 
        const vertices = [];
        const indices = [];
        const uvs = [];
        
        for (let i = 0; i < points.length; i++) {
            const p = points[i];
            
            // Calculate tangent
            let tangent;
            if (i === 0) {
                tangent = new THREE.Vector3().subVectors(points[i + 1], p).normalize();
            } else if (i === points.length - 1) {
                tangent = new THREE.Vector3().subVectors(p, points[i - 1]).normalize();
            } else {
                tangent = new THREE.Vector3().subVectors(points[i + 1], points[i - 1]).normalize();
            }

            const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();
            
            // Extrude left and right
            const left = new THREE.Vector3().copy(p).addScaledVector(normal, width / 2);
            const right = new THREE.Vector3().copy(p).addScaledVector(normal, -width / 2);

            // Lift slightly
            left.z += 0.05;
            right.z += 0.05;

            vertices.push(left.x, left.y, left.z);
            vertices.push(right.x, right.y, right.z);
            
            // Simple UVs
            const t = i / (points.length - 1);
            uvs.push(0, t);
            uvs.push(1, t);

            // Triangles
            if (i < points.length - 1) {
                const base = i * 2;
                indices.push(base, base + 2, base + 1); // Counter-clockwise
                indices.push(base + 1, base + 2, base + 3);
            }
        }
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();
        
        return { pathGeometry: geo, totalSamples: points.length };

    }, [sdcState]);

    // Update Draw Range based on Frame
    // Use a ref to mesh to update geometry drawRange without excessive re-renders
    const meshRef = useRef();

    useFrame(() => {
        if (!meshRef.current || !pathGeometry || !frameRef) return;
        
        // We have Total Frames approx 91 relative to data structure (10 past + 1 curr + 80 future)
        // 'frame' prop comes from Scene, 0..90.
        
        const frame = frameRef.current;
        const TOTAL_DATA_FRAMES = 91; 
        const progress = Math.min(Math.max(frame / TOTAL_DATA_FRAMES, 0), 0.99); // Cap slightly
        
        // Map progress to start sample
        const startSample = Math.floor(progress * totalSamples);
        
        // Each sample adds 2 triangles = 6 indices.
        // Start Index should be startSample * 6.
        const startIndex = startSample * 6;
        const totalIndices = totalSamples * 6;
        const count = totalIndices - startIndex;
        
        meshRef.current.geometry.setDrawRange(startIndex, count);
    });

    if (!pathGeometry) return null;

    return (
        <mesh ref={meshRef} geometry={pathGeometry} frustumCulled={false}>
             <meshBasicMaterial 
                color="#00FF00" 
                transparent 
                opacity={0.3} 
                side={THREE.DoubleSide} 
                depthWrite={false} 
            />
        </mesh>
    );
}
