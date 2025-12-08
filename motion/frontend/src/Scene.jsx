import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { RoadGraph } from './components/RoadGraph';
import { Agents } from './components/Agents';
import { CameraRig } from './components/CameraRig';
import { TrafficLights } from './components/TrafficLights';
import { PathSamples } from './components/PathSamples';
import { SdcPathHighlight } from './components/SdcPathHighlight';
import { TrafficLightHighlight } from './components/TrafficLightHighlight';
import { TrafficAudio } from './components/TrafficAudio';

export function Scene({ data, fileInfo, scenarioInfo, onFinished }) {
  // Removed frame state to prevent full scene re-renders
  const [variant, setVariant] = useState(0);
  const [cameraName, setCameraName] = useState('');
  
  // Total frames: 10 past + 1 current + 80 future = 91
  const TOTAL_FRAMES = 91;

  // Refs for UI updates
  const frameUiRef = useRef();
  const speedUiRef = useRef();

  // Calculate generic center to keep everything near 0,0,0
  // Optimization Phase 10: Parse Once, Pass Everywhere
  const parsedMap = useMemo(() => {
    if (!data) return null;
    const featureMap = data?.context?.featureMap;
    // Robust map creation
    let map;
    if (Array.isArray(featureMap)) {
         if (featureMap.length > 0 && Array.isArray(featureMap[0])) {
             map = new Map(featureMap);
         } else if (featureMap.length > 0 && typeof featureMap[0] === 'object') {
             map = new Map(featureMap.map(e => [e.key, e.value]));
         } else {
             map = new Map();
         }
    } else {
        map = new Map(Object.entries(featureMap || {}));
    }
    return map;
  }, [data]);

  const center = useMemo(() => {
    if (!parsedMap) return [0, 0, 0];
    
    // Try to find SDC
    const sdcList = parsedMap.get('state/is_sdc')?.int64List?.valueList;
    const xList = parsedMap.get('state/current/x')?.floatList?.valueList;
    const yList = parsedMap.get('state/current/y')?.floatList?.valueList;
    const zList = parsedMap.get('state/current/z')?.floatList?.valueList;

    if (!xList || !yList) return [0, 0, 0];

    // Find index of SDC (val === 1)
    let sdcIndex = -1;
    if (sdcList) {
        sdcIndex = sdcList.indexOf(Number(1)); 
        if (sdcIndex === -1) sdcIndex = sdcList.findIndex(v => v == 1);
    }
    
    // Fallback to first agent
    if (sdcIndex === -1) sdcIndex = 0;
    
    return [xList[sdcIndex] || 0, yList[sdcIndex] || 0, zList[sdcIndex] || 0];
  }, [parsedMap]);

  const scenarioId = useMemo(() => {
     if (!parsedMap) return null;
     const idVal = parsedMap.get('scenario/id')?.bytesList?.valueList?.[0];
     if (!idVal) return 'Unknown';
     return String(idVal);
  }, [parsedMap]);

  // Extract SDC Speed Trajectory
  const sdcSpeeds = useMemo(() => {
    if (!parsedMap) return [];
    
    // 1. Find SDC Index
    const sdcList = parsedMap.get('state/is_sdc')?.int64List?.valueList;
    if (!sdcList) return [];
    
    let sdcIndex = sdcList.indexOf(Number(1));
    if (sdcIndex === -1) sdcIndex = sdcList.findIndex(v => v == 1);
    if (sdcIndex === -1) return [];

    // 2. Get Speed Data
    const getVal = (key) => {
        const feat = parsedMap.get(key);
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
  }, [parsedMap]);

  const frameRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Animation Loop Component
  const AnimationLoop = () => {
      // Render Counter Ref
      const renderCounter = useRef(0);

      useFrame((state, delta) => {
          if (!isPlaying) return;
          
          // Advance frame
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

          // Imperative UI Updates - Throttled
          const currentFrameInt = Math.floor(frameRef.current);
           
          renderCounter.current++;
           
          if (renderCounter.current % 10 === 0) {
              if (frameUiRef.current) {
                   frameUiRef.current.innerText = `Frame: ${currentFrameInt} / ${TOTAL_FRAMES}`;
              }
              if (speedUiRef.current) {
                  const spd = sdcSpeeds[currentFrameInt] !== undefined ? sdcSpeeds[currentFrameInt] : 0;
                  speedUiRef.current.innerText = `Speed: ${spd.toFixed(2)} m/s`;
              }
           }
      });
      return null;
  };

  // Reset when data changes
  useEffect(() => {
     if (data) {
        frameRef.current = 0;
        // Also reset UI
        if (frameUiRef.current) frameUiRef.current.innerText = `Frame: 0 / ${TOTAL_FRAMES}`;
        if (speedUiRef.current && sdcSpeeds[0]) speedUiRef.current.innerText = `Speed: ${sdcSpeeds[0].toFixed(2)} m/s`;
        
        setVariant(Math.floor(Math.random() * 100));
        setIsPlaying(true);
     }
  }, [data, sdcSpeeds]);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: 'black' }}>
        <Canvas camera={{ position: [0, -20, 20], fov: 45, up: [0, 0, 1] }}>
            <color attach="background" args={['#1a2b3c']} />
            <ambientLight intensity={0.8} />
            <pointLight position={[50, 50, 100]} intensity={1} />
            <OrbitControls makeDefault />
            <AnimationLoop />
            
            {parsedMap && <RoadGraph map={parsedMap} center={center} />}
            {parsedMap && <SdcPathHighlight map={parsedMap} center={center} frameRef={frameRef} />}
            {parsedMap && <PathSamples map={parsedMap} center={center} />}
            {parsedMap && <Agents map={parsedMap} frameRef={frameRef} center={center} />} 
            {parsedMap && <TrafficLights key="traffic-lights-spheres" map={parsedMap} frameRef={frameRef} center={center} />}
            {parsedMap && <TrafficLightHighlight map={parsedMap} frameRef={frameRef} center={center} />}
            {(() => {
                 // Optimization: Params are checked inside render.
                 // It's fast enough, but cleaner to extract if we want perfectly clean render.
                 // However, for this block IIFE, it's fine.
                 return (new URLSearchParams(window.location.search).get('audio') !== 'false') && parsedMap && <TrafficAudio sdcSpeeds={sdcSpeeds} frameRef={frameRef} isPlaying={isPlaying} />;
            })()}
            {(() => {
                 const isAuto = new URLSearchParams(window.location.search).get('autoCamera') !== 'false';
                 return parsedMap && <CameraRig map={parsedMap} frameRef={frameRef} center={center} variant={variant} isAuto={isAuto} onCameraChange={setCameraName} />;
            })()}
        </Canvas>
        
        {/* Minimal Info */}
        <div style={{ position: 'absolute', bottom: 20, left: 20, color: 'white', fontFamily: 'monospace', opacity: 0.7 }}>
            <div>Scn: {scenarioInfo ? `${scenarioInfo.index}/${scenarioInfo.total} - ` : ''}{scenarioId || 'Loading...'}</div>
            <div>File: {fileInfo ? `${fileInfo.index}/${fileInfo.total} - ${fileInfo.name}` : 'Loading...'}</div>
            <div ref={frameUiRef}>Frame: 0 / {TOTAL_FRAMES}</div>
            <div ref={speedUiRef}>Speed: 0.00 m/s</div>
            <div>Cam: {cameraName}</div>
        </div>
    </div>
  );
}
