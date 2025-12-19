import React, { useState, useEffect, useRef, useMemo } from "react";
import { ENVS } from "./constants/environments";
import { EnvironmentPreloader } from "./components/EnvironmentPreloader";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Environment, ContactShadows } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { RoadGraph } from "./components/RoadGraph";
import { Agents } from "./components/Agents";
import { CameraRig } from "./components/CameraRig";
import { TrafficLights } from "./components/TrafficLights";
import { PathSamples } from "./components/PathSamples";
import { SdcPathHighlight } from "./components/SdcPathHighlight";

import { Rain } from "./components/Rain";
import { Snow } from "./components/Snow";
import { Dust } from "./components/Dust";
import { Lightning } from "./components/Lightning";

// Total frames: 10 past + 1 current + 80 future = 91
const TOTAL_FRAMES = 91;

// Animation Loop Component extracted to avoid re-creation on every render
const AnimationLoop = ({ frameRef, isPlaying, setIsPlaying, onFinished, sdcSpeeds, frameUiRef, speedUiRef }) => {
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
        const spd =
          sdcSpeeds && sdcSpeeds[currentFrameInt] !== undefined
            ? sdcSpeeds[currentFrameInt]
            : 0;
        speedUiRef.current.innerText = `Speed: ${spd.toFixed(2)} m/s`;
      }
    }
  });
  return null;
};

export function Scene({ data, fileInfo, scenarioInfo, onFinished }) {
  // data is now the Pre-Parsed Object from useRecordBuffer
  // { parsedMap, center, scenarioId, parsedAgents, parsedTrafficLights, parsedPathSamples, parsedSdcState, sdcSpeeds }

  const [cameraName, setCameraName] = useState("");

  // Refs for UI updates
  const frameUiRef = useRef();
  const speedUiRef = useRef();

  // Destructure with robust defaults to prevent crashes on initial load
  const {
      parsedMap = null,
      center = [0, 0, 0],
      scenarioId = null,
      parsedAgents = [],
      parsedTrafficLights = [],
      parsedPathSamples = null,
      parsedSdcState = null,
      sdcSpeeds = []
  } = data || {};

  const frameRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(true);

  // Compute env/weather/variant deterministically or via useMemo
  // Use scenarioId as a seed if available, or just random but memoized per data instance
  const { variant, envName, weather } = useMemo(() => {
    // If data is null, return defaults
    if (!data) return { variant: 0, envName: "night", weather: "clear" };

    const keys = Object.keys(ENVS);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];

    // Weather Probability: 80% Clear, 20% Special
    const r = Math.random();
    let w = "clear";
    if (r > 0.8) {
      const types = ["rain", "snow", "fog", "dust", "storm"];
      w = types[Math.floor(Math.random() * types.length)];
    }

    return {
        variant: Math.floor(Math.random() * 100),
        envName: randomKey,
        weather: w
    };
  }, [data]); // Re-compute only when data changes (new scenario)

  // Reset when data changes
  useEffect(() => {
    if (data) {
      frameRef.current = 0;
      // Also reset UI
      if (frameUiRef.current)
        frameUiRef.current.innerText = `Frame: 0 / ${TOTAL_FRAMES}`;
      if (speedUiRef.current && sdcSpeeds && sdcSpeeds[0])
        speedUiRef.current.innerText = `Speed: ${sdcSpeeds[0].toFixed(2)} m/s`;

      setIsPlaying(true);
    }
  }, [data, sdcSpeeds]);


  // Memoize CameraRig Logic
  const cameraRigComponent = useMemo(() => {
    const isAuto = new URLSearchParams(window.location.search).get("autoCamera") !== "false";
    return parsedMap ? (
        <CameraRig
          map={parsedMap}
          agents={parsedAgents}
          frameRef={frameRef}
          center={center}
          variant={variant}
          isAuto={isAuto}
          onCameraChange={setCameraName}
        />
    ) : null;
  }, [parsedMap, parsedAgents, center, variant]);

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        position: "relative",
        background: "#101010",
      }}
    >
      <Canvas
        camera={{ position: [0, -20, 20], fov: 45, up: [0, 0, 1] }}
        shadows
      >
        <EnvironmentPreloader />
        <color attach="background" args={["#050505"]} />
        <ambientLight intensity={0.1} /> {/* Darker ambient */}
        <directionalLight
          position={[50, 50, 100]}
          intensity={0.5}
          castShadow
          shadow-mapSize={[2048, 2048]}
        />
        {/* Local Environment Asset */}
        <Environment files={ENVS[envName]} blur={0.6} background={false} />
        {/* Weather Effects */}
        {weather === "fog" && <fog attach="fog" args={["#1a1a1a", 10, 80]} />}
        {weather === "dust" && <fog attach="fog" args={["#e6c288", 5, 60]} />}
        {/* Storm is darker */}
        {weather === "storm" && (
          <fog attach="fog" args={["#050510", 10, 100]} />
        )}
        <OrbitControls makeDefault />
        <AnimationLoop
            frameRef={frameRef}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            onFinished={onFinished}
            sdcSpeeds={sdcSpeeds}
            frameUiRef={frameUiRef}
            speedUiRef={speedUiRef}
        />
        <EffectComposer disableNormalPass>
          <Bloom
            luminanceThreshold={1.0}
            mipmapBlur
            intensity={1.5}
            radius={0.4}
          />
        </EffectComposer>
        <group position={[0, 0, -0.78]}>
          <ContactShadows
            resolution={1024}
            scale={200}
            blur={2}
            opacity={0.5}
            far={10}
            color="#000000"
          />
        </group>
        {parsedMap && <RoadGraph map={parsedMap} center={center} />}
        {parsedMap && (
          <SdcPathHighlight sdcState={parsedSdcState} frameRef={frameRef} />
        )}
        {parsedPathSamples && <PathSamples vertices={parsedPathSamples} />}
        {parsedMap && (
          <Agents
            agents={parsedAgents}
            trafficLights={parsedTrafficLights}
            frameRef={frameRef}
          />
        )}
        {parsedTrafficLights && (
          <TrafficLights
            key="traffic-lights-spheres"
            trafficLights={parsedTrafficLights}
            frameRef={frameRef}
          />
        )}
        {/* New Visual Layer: Weather */}
        {(weather === "rain" || weather === "storm") && (
          <Rain count={weather === "storm" ? 15000 : 10000} />
        )}
        {weather === "snow" && <Snow />}
        {weather === "dust" && <Dust />}
        {weather === "storm" && <Lightning />}

        {cameraRigComponent}
      </Canvas>

      {/* Minimal Info */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: 20,
          color: "white",
          fontFamily: "monospace",
          opacity: 0.7,
        }}
      >
        <div ref={speedUiRef}>Speed: 0.00 m/s</div>
        <div>
          Camera: {cameraName} | Env: {envName.toUpperCase()}
          {weather !== "clear" ? ` + ${weather.toUpperCase()}` : ""}
        </div>
        <div ref={frameUiRef}>Frame: 0 / {TOTAL_FRAMES}</div>
        <div>
          File:{" "}
          {fileInfo
            ? `${fileInfo.index}/${fileInfo.total} - ${fileInfo.name}`
            : "Loading..."}{" "}
          | Scenario:{" "}
          {scenarioInfo ? `${scenarioInfo.index}/${scenarioInfo.total} - ` : ""}
          {scenarioId || "Loading..."}
        </div>
      </div>
    </div>
  );
}
