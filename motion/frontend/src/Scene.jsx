import React, { useState, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RoadGraph } from './components/RoadGraph';
import { Agents } from './components/Agents';
import { CameraRig, CAMERA_VARIATIONS } from './components/CameraRig';

export function Scene({ data, onFinished }) {
  const [frame, setFrame] = useState(0);
  const [variant, setVariant] = useState(0);
  
  // Total frames: 10 past + 1 current + 80 future = 91
  const TOTAL_FRAMES = 91;

  // Calculate generic center to keep everything near 0,0,0
  const center = useMemo(() => {
    if (!data) return [0, 0, 0];
    const featureMap = data?.context?.featureMap;
    // Robust map creation
    let map;
    if (Array.isArray(featureMap)) map = new Map(featureMap);
    else map = new Map(Object.entries(featureMap || {}));
    
    // Try to find SDC
    const sdcList = map.get('state/is_sdc')?.int64List?.valueList;
    const xList = map.get('state/current/x')?.floatList?.valueList;
    const yList = map.get('state/current/y')?.floatList?.valueList;
    const zList = map.get('state/current/z')?.floatList?.valueList;

    if (!xList || !yList) return [0, 0, 0];

    // Find index of SDC (val === 1)
    let sdcIndex = -1;
    if (sdcList) {
        sdcIndex = sdcList.indexOf(Number(1)); 
        // JSON parsing of int64 often results in strings if too large, or numbers.
        // Let's safe find
        if (sdcIndex === -1) sdcIndex = sdcList.findIndex(v => v == 1);
    }
    
    // Fallback to first agent
    if (sdcIndex === -1) sdcIndex = 0;
    
    return [xList[sdcIndex] || 0, yList[sdcIndex] || 0, zList[sdcIndex] || 0];
  }, [data]);

  // Auto-play loop
  useEffect(() => {
    if (!data) return;
    
    // Start loop
    const interval = setInterval(() => {
      setFrame(f => {
        const next = f + 1;
        if (next >= TOTAL_FRAMES) {
            // Trigger finish, allowing parent to load next
            // We use setTimeout to break the render cycle
            if (onFinished) setTimeout(onFinished, 0); 
            return 0; // Loop or wait? Let's loop until next data comes
        }
        return next;
      });
    }, 100); // 10Hz

    return () => clearInterval(interval);
  }, [data, onFinished]);

  // Separate effect for data reset
  useEffect(() => {
     if (data) {
        setFrame(0);
        setVariant(Math.floor(Math.random() * CAMERA_VARIATIONS.length));
     }
  }, [data]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: 'black' }}>
        <Canvas camera={{ position: [0, 0, 10], fov: 45, up: [0, 1, 0] }}> {/* Top-down view, centered on ego, close up */}
            <color attach="background" args={['#000']} />
            <ambientLight intensity={0.8} />
            <pointLight position={[50, 50, 100]} intensity={1} />
            <OrbitControls makeDefault />
            
            {data && <RoadGraph data={data} center={center} />}
            {data && <Agents data={data} frame={frame} center={center} />}
            {data && <CameraRig data={data} frame={frame} center={center} variant={variant} />}
        </Canvas>
        
        {/* Minimal Info */}
        <div style={{ position: 'absolute', bottom: 20, left: 20, color: 'white', fontFamily: 'monospace', opacity: 0.7 }}>
            <div>Scn: {data?.context?.name || 'Loading...'}</div>
            <div>Frame: {frame} / {TOTAL_FRAMES}</div>
        </div>
    </div>
  );
}
