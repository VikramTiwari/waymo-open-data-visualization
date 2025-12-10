
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Environment, ContactShadows } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import { RoadGraph } from './components/RoadGraph';
import { Agents } from './components/Agents';
import { CameraRig } from './components/CameraRig';
import { TrafficLights } from './components/TrafficLights';
import { PathSamples } from './components/PathSamples';
import { SdcPathHighlight } from './components/SdcPathHighlight';
import { TrafficLightHighlight } from './components/TrafficLightHighlight';

import { Rain } from './components/Rain';
import { Snow } from './components/Snow';
import { Dust } from './components/Dust';
import { Lightning } from './components/Lightning';

// We just import ENVS for the Environment component,
// but we expect `data` to already contain the decision on which env to use.
import { ENVS } from './utils/parsers';

export function Scene({ data, fileInfo, scenarioInfo, onFinished }) {
  // data is now the "parsedRecord" object from parsers.js

  // No more heavy useMemos here!
  // We just access the pre-calculated fields.
  const parsedMap = data?.map;
  const center = data?.center || [0, 0, 0];
  const scenarioId = data?.scenarioId;
  const sdcSpeeds = data?.sdcSpeeds || [];
  const parsedAgents = data?.agents || [];
  const parsedTrafficLights = data?.trafficLights || [];
  const parsedPathSamples = data?.pathSamples;
  const parsedSdcState = data?.sdcState;

  const meta = data?.meta || {};
  const { envFile, weather, variant } = meta;

  const [cameraName, setCameraName] = useState('');
  
  // Total frames: 10 past + 1 current + 80 future = 91
  const TOTAL_FRAMES = 91;

  // Refs for UI updates
  const frameUiRef = useRef();
  const speedUiRef = useRef();

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
        
        setIsPlaying(true);
     }
  }, [data, sdcSpeeds]);

  // Preload Environments
  useEffect(() => {
      // Try to preload the next likely environments if possible, but
      // just ensuring the current one is loaded is good.
      // useEnvironment from Drei uses suspense/cache so it handles it.
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh', position: 'relative', background: '#101010' }}>
        <Canvas camera={{ position: [0, -20, 20], fov: 45, up: [0, 0, 1] }} shadows>
            <color attach="background" args={['#050505']} />
            
            <ambientLight intensity={0.1} /> {/* Darker ambient */}
            <directionalLight 
                position={[50, 50, 100]} 
                intensity={0.5} 
                castShadow 
                shadow-mapSize={[2048, 2048]}
            />
            
            {/* Local Environment Asset */}
            {envFile && <Environment files={envFile} blur={0.6} background={false} />}
            
            {/* Weather Effects */}
            {weather === 'fog' && <fog attach="fog" args={['#1a1a1a', 10, 80]} />}
            {weather === 'dust' && <fog attach="fog" args={['#e6c288', 5, 60]} />} 
            
            {/* Storm is darker */}
            {weather === 'storm' && <fog attach="fog" args={['#050510', 10, 100]} />}
            
            <OrbitControls makeDefault />
            <AnimationLoop />
            
            <EffectComposer disableNormalPass>
                <Bloom luminanceThreshold={1.0} mipmapBlur intensity={1.5} radius={0.4} />
            </EffectComposer>
            
            <group position={[0,0,-0.78]}>
               <ContactShadows resolution={1024} scale={200} blur={2} opacity={0.5} far={10} color="#000000" />
            </group>
            
            {parsedMap && <RoadGraph map={parsedMap} center={center} />}
            {parsedMap && <SdcPathHighlight sdcState={parsedSdcState} frameRef={frameRef} />}
            {parsedPathSamples && <PathSamples vertices={parsedPathSamples} />}


            {parsedMap && <Agents agents={parsedAgents} trafficLights={parsedTrafficLights} frameRef={frameRef} />} 
            {parsedTrafficLights && <TrafficLights key="traffic-lights-spheres" trafficLights={parsedTrafficLights} frameRef={frameRef} />}
            
            {/* New Visual Layer: Weather */}
            {(weather === 'rain' || weather === 'storm') && <Rain count={weather === 'storm' ? 15000 : 10000} />}
            {weather === 'snow' && <Snow />}
            {weather === 'dust' && <Dust />}
            {weather === 'storm' && <Lightning />}

            {(() => {
                 const isAuto = new URLSearchParams(window.location.search).get('autoCamera') !== 'false';
                 // We pass variant from meta now
                 return parsedMap && <CameraRig map={parsedMap} agents={parsedAgents} frameRef={frameRef} center={center} variant={variant || 0} isAuto={isAuto} onCameraChange={setCameraName} />;
            })()}
        </Canvas>
        
        {/* Minimal Info */}
        <div style={{ position: 'absolute', bottom: 20, left: 20, color: 'white', fontFamily: 'monospace', opacity: 0.7 }}>
            <div ref={speedUiRef}>Speed: 0.00 m/s</div>
            <div>Camera: {cameraName} | Env: {meta?.envName?.toUpperCase() || ''}{weather && weather !== 'clear' ? ` + ${weather.toUpperCase()}` : ''}</div>
            <div ref={frameUiRef}>Frame: 0 / {TOTAL_FRAMES}</div>
            <div>File: {fileInfo ? `${fileInfo.index}/${fileInfo.total} - ${fileInfo.name}` : 'Loading...'} | Scenario: {scenarioInfo ? `${scenarioInfo.index}/${scenarioInfo.total} - ` : ''}{scenarioId || 'Loading...'}</div>
        </div>
    </div>
  );
}
