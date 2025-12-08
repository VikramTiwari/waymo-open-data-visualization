import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export function SdcPathHighlight({ data, center, frameRef }) {
    const { pathGeometry, totalSamples } = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return { pathGeometry: null, totalSamples: 0 };
        
        let map;
        if (Array.isArray(featureMap)) {
            map = new Map(featureMap);
        } else {
             map = new Map(Object.entries(featureMap || {}));
        }

        const getVal = (key) => {
            const feat = map.get(key);
            return feat?.floatList?.valueList || feat?.int64List?.valueList || [];
        };

        // Find SDC Index
        const sdcList = getVal('state/is_sdc');
        if (!sdcList.length) return { pathGeometry: null, totalSamples: 0 };
        
        let sdcIndex = -1;
        // Check for 1 (int64 might be string or number)
        sdcIndex = sdcList.findIndex(v => v == 1);
        if (sdcIndex === -1) return { pathGeometry: null, totalSamples: 0 };

        const count = sdcList.length;

        // Get Full Trajectory for SDC (Past + Current + Future)
        const pastX = getVal('state/past/x');
        const pastY = getVal('state/past/y');
        const pastZ = getVal('state/past/z');
        const currX = getVal('state/current/x');
        const currY = getVal('state/current/y');
        const currZ = getVal('state/current/z');
        const futureX = getVal('state/future/x');
        const futureY = getVal('state/future/y');
        const futureZ = getVal('state/future/z');
        
        const heightList = getVal('state/current/height');
        const sdcHeight = heightList[sdcIndex] || 1.6;
        
        const pastLen = pastX.length / count;
        const futureLen = futureX.length / count;
        
        // Validation
        if (count === 0) return { pathGeometry: null, totalSamples: 0 };

        const [cx, cy, cz] = center;
        const points = [];

        // Past
        for (let t = 0; t < pastLen; t++) {
             const idx = sdcIndex * pastLen + t;
             points.push(new THREE.Vector3(
                pastX[idx] - cx,
                pastY[idx] - cy,
                pastZ[idx] - cz - (sdcHeight / 2)
             ));
        }

        // Current
        if (currX[sdcIndex] !== undefined) {
             points.push(new THREE.Vector3(
                currX[sdcIndex] - cx,
                currY[sdcIndex] - cy,
                currZ[sdcIndex] - cz - (sdcHeight / 2)
             ));
        }

        // Future
        for (let t = 0; t < futureLen; t++) {
             const idx = sdcIndex * futureLen + t;
             points.push(new THREE.Vector3(
                futureX[idx] - cx,
                futureY[idx] - cy,
                futureZ[idx] - cz - (sdcHeight / 2)
             ));
        }
        
        if (points.length < 2) return { pathGeometry: null, totalSamples: 0 };

        // Create a Curve
        const curve = new THREE.CatmullRomCurve3(points);
        
        // Improved approach: Create a strip geometry.
        
        const width = 2.4; // Slightly wider than car
        const vertices = [];
        const indices = [];
        const uv = [];
        
        // Sampling curve
        // We want enough samples to match roughly the frame count for smooth hiding?
        // Total points ~ 91.
        // Let's use more samples for smoothness, e.g. 200.
        const samples = 200;
        
        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            const pt = curve.getPoint(t);
            const tangent = curve.getTangent(t);
            
            // Assume Z up
            const up = new THREE.Vector3(0, 0, 1);
            const binormal = new THREE.Vector3().crossVectors(tangent, up).normalize();
            
            // Offset
            const left = pt.clone().addScaledVector(binormal, width / 2);
            const right = pt.clone().addScaledVector(binormal, -width / 2);
            
            // Lift slightly above ground to avoid z-fighting
            left.z += 0.05;
            right.z += 0.05;
            
            vertices.push(left.x, left.y, left.z);
            vertices.push(right.x, right.y, right.z);
            
            uv.push(0, t);
            uv.push(1, t); // Simple UV
        }
        
        // Triangles
        for (let i = 0; i < samples; i++) {
            const base = i * 2;
            indices.push(base, base + 2, base + 1);
            indices.push(base + 1, base + 2, base + 3);
        }
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); // Optional
        geo.setIndex(indices);
        geo.computeVertexNormals();
        
        return { pathGeometry: geo, totalSamples: samples };

    }, [data, center]);

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
