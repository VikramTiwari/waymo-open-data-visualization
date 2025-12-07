import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RoadGraph } from './components/RoadGraph';
import { Agents } from './components/Agents';
import { CameraRig } from './components/CameraRig';
import { TrafficLights } from './components/TrafficLights';
import { PathSamples } from './components/PathSamples';

export function Scene({ data, fileInfo, scenarioInfo, onFinished }) {
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

  const scenarioId = useMemo(() => {
     if (!data) return null;
     const featureMap = data?.context?.featureMap;
     let map;
     if (Array.isArray(featureMap)) map = new Map(featureMap);
     else map = new Map(Object.entries(featureMap || {}));
     
     const idVal = map.get('scenario/id')?.bytesList?.valueList?.[0];
     if (!idVal) return 'Unknown';
     // If it's base64 (common in JSON for bytes), we might want to decode, but often the ID is just the string.
     // Let's return it as is first.
     return String(idVal);
  }, [data]);

  // Extract SDC Speed Trajectory
  const sdcSpeeds = useMemo(() => {
    if (!data) return [];
    
    const featureMap = data?.context?.featureMap;
    let map;
    if (Array.isArray(featureMap)) map = new Map(featureMap);
    else map = new Map(Object.entries(featureMap || {}));
    
    // 1. Find SDC Index
    const sdcList = map.get('state/is_sdc')?.int64List?.valueList;
    if (!sdcList) return [];
    
    let sdcIndex = sdcList.indexOf(Number(1));
    if (sdcIndex === -1) sdcIndex = sdcList.findIndex(v => v == 1);
    if (sdcIndex === -1) return [];

    // 2. Get Speed Data
    const getVal = (key) => {
        const feat = map.get(key);
        return feat?.floatList?.valueList || [];
    }
    
    const pastSpeed = getVal('state/past/speed');
    const currSpeed = getVal('state/current/speed');
    const futureSpeed = getVal('state/future/speed');
    
    const count = sdcList.length;
    
    // Derived lengths
    const pastLen = pastSpeed.length / count; 
    const futureLen = futureSpeed.length / count;

    const speeds = [];

    // Past
    for (let t = 0; t < pastLen; t++) {
        speeds.push(pastSpeed[sdcIndex * pastLen + t] || 0);
    }
    // Current
    speeds.push(currSpeed[sdcIndex] || 0);
    // Future
    for (let t = 0; t < futureLen; t++) {
        speeds.push(futureSpeed[sdcIndex * futureLen + t] || 0);
    }
    
    return speeds;
  }, [data]);

  const frameRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Animation Loop Component
  const AnimationLoop = () => {
      useFrame((state, delta) => {
          if (!isPlaying) return;
          
          // Advance frame
          // Data is 10Hz (0.1s per frame).
          // We want 1 frame per 0.1s.
          // speed = 10 frames per second.
          const speed = 10; 
          frameRef.current += delta * speed;

          if (frameRef.current >= TOTAL_FRAMES) {
             // Loop or Finish
             if (onFinished) {
                 onFinished();
                 setIsPlaying(false); // Stop until reset
             }
             frameRef.current = TOTAL_FRAMES - 1; 
          }

          // Sync UI state every frame (or throttle if needed, but simple is fine for now)
          // Flooring to avoid excessive updates if we checked strict equality?
          // Actually, setting state 60fps is heavy. Let's set it only if integer changes.
          const currentInt = Math.floor(frameRef.current);
          setFrame(prev => {
              if (prev !== currentInt) return currentInt;
              return prev;
          });
      });
      return null;
  };

  // Reset when data changes
  useEffect(() => {
     if (data) {
        frameRef.current = 0;
        setFrame(0);
        setVariant(Math.floor(Math.random() * 100));
        setIsPlaying(true);
     }
  }, [data]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: 'black' }}>
        <Canvas camera={{ position: [0, -20, 20], fov: 45, up: [0, 0, 1] }}>
            <color attach="background" args={['#000']} />
            <ambientLight intensity={0.8} />
            <pointLight position={[50, 50, 100]} intensity={1} />
            <OrbitControls makeDefault />
            <AnimationLoop />
            
            {data && <RoadGraph data={data} center={center} />}
            {data && <PathSamples data={data} center={center} />}
            {data && <Agents data={data} frameRef={frameRef} center={center} />} 
            {data && <TrafficLights key="traffic-lights-spheres" data={data} frame={frame} center={center} />}
            {data && <CameraRig data={data} frameRef={frameRef} center={center} variant={variant} />}
        </Canvas>
        
        {/* Minimal Info */}
        <div style={{ position: 'absolute', bottom: 20, left: 20, color: 'white', fontFamily: 'monospace', opacity: 0.7 }}>
            <div>Scn: {scenarioInfo ? `${scenarioInfo.index}/${scenarioInfo.total} - ` : ''}{scenarioId || 'Loading...'}</div>
            <div>File: {fileInfo ? `${fileInfo.index}/${fileInfo.total} - ${fileInfo.name}` : 'Loading...'}</div>
            <div>Frame: {frame} / {TOTAL_FRAMES}</div>
            <div>Speed: {sdcSpeeds[frame] ? sdcSpeeds[frame].toFixed(2) : '0.00'} m/s</div>
        </div>
    </div>
  );
}
