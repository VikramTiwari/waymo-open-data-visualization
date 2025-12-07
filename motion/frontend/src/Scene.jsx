import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Canvas, useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Grid, Line } from '@react-three/drei';
import * as THREE from 'three';

export function Scene({ data, onFinished }) {
  const [frame, setFrame] = useState(0);
  
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
     if (data) setFrame(0);
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
            {data && <CameraRig data={data} frame={frame} center={center} />}
        </Canvas>
        
        {/* Minimal Info */}
        <div style={{ position: 'absolute', bottom: 20, left: 20, color: 'white', fontFamily: 'monospace', opacity: 0.7 }}>
            <div>Scn: {data?.context?.name || 'Loading...'}</div>
            <div>Frame: {frame} / {TOTAL_FRAMES}</div>
        </div>
    </div>
  );
}

function RoadGraph({ data, center }) {
    const lines = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return [];
        
        let map;
        if (Array.isArray(featureMap)) {
            map = new Map(featureMap);
        } else {
             map = new Map(Object.entries(featureMap || {}));
        }
        
        // Helper to get values
        const getVal = (key) => {
            const feat = map.get(key);
            if (!feat) {
                return [];
            }
            return feat.floatList?.valueList || feat.int64List?.valueList || [];
        };

        const xyz = getVal('roadgraph_samples/xyz');
        const ids = getVal('roadgraph_samples/id');
        const types = getVal('roadgraph_samples/type'); 

        if (!xyz.length || !ids.length) return [];
        
        const segments = {};
        const [cx, cy, cz] = center;

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            if (!segments[id]) {
                segments[id] = { points: [], type: types[i] || 0 };
            }
            // Waymo coords: X, Y, Z. 
            // ThreeJS: Let's keep Z up for simplicity and adjust camera.
            const x = xyz[i*3] - cx;
            const y = xyz[i*3+1] - cy;
            const z = xyz[i*3+2] - cz;
            segments[id].points.push(new THREE.Vector3(x, y, z));
        }
        
        return Object.values(segments);

    }, [data, center]);

    return (
        <group>
            {lines.map((seg, idx) => (
                <Line 
                    key={idx} 
                    points={seg.points} 
                    color={getRoadColor(seg.type)} 
                    lineWidth={1} 
                />
            ))}
        </group>
    );
}

function Agents({ data, frame, center }) {
    const agents = useMemo(() => {
        const featureMap = data?.context?.featureMap;
        if (!featureMap) return [];
        
        let map;
        if (Array.isArray(featureMap)) {
            map = new Map(featureMap);
        } else {
             map = new Map(Object.entries(featureMap || {}));
        }

        const getVal = (key) => { 
            const feat = map.get(key);
            if (!feat) return [];
            return feat.floatList?.valueList || feat.int64List?.valueList || [];
        };
        
        const ids = getVal('state/id');
        const count = ids.length;
        if (count === 0) return [];
        
        const pastX = getVal('state/past/x');
        const pastY = getVal('state/past/y');
        const pastZ = getVal('state/past/z');
        const pastYaw = getVal('state/past/bbox_yaw');
        const pastLen = pastX.length / count; // Should be 10

        const currX = getVal('state/current/x');
        const currY = getVal('state/current/y');
        const currZ = getVal('state/current/z');
        const currYaw = getVal('state/current/bbox_yaw');
        
        const futureX = getVal('state/future/x');
        const futureY = getVal('state/future/y');
        const futureZ = getVal('state/future/z');
        const futureYaw = getVal('state/future/bbox_yaw');
        const futureLen = futureX.length / count; // Should be 80
        
        const width = getVal('state/current/width');
        const length = getVal('state/current/length');
        const height = getVal('state/current/height');
        const type = getVal('state/type');
        const isSdcList = getVal('state/is_sdc');
        
        const [cx, cy, cz] = center;

        const parsedAgents = [];
        for (let i = 0; i < count; i++) {
            const trajectory = [];
            
            // Past (10 frames)
            for (let t = 0; t < pastLen; t++) {
                const idx = i * pastLen + t;
                trajectory.push([
                    pastX[idx] - cx, 
                    pastY[idx] - cy, 
                    pastZ[idx] - cz,
                    pastYaw[idx] || 0
                ]);
            }
            
            // Current (1 frame)
            trajectory.push([
                currX[i] - cx, 
                currY[i] - cy, 
                currZ[i] - cz,
                currYaw[i] || 0
            ]);
            
            // Future (80 frames)
            for (let t = 0; t < futureLen; t++) {
                const idx = i * futureLen + t;
                trajectory.push([
                    futureX[idx] - cx, 
                    futureY[idx] - cy, 
                    futureZ[idx] - cz,
                    futureYaw[idx] || 0
                ]);
            }
            
            // Check if SDC (loosely check for 1)
            const isSdc = isSdcList && isSdcList[i] == 1;

            parsedAgents.push({
                id: ids[i],
                type: type[i],
                isSdc: isSdc,
                dims: [length[i], width[i], height[i] || 1.5], // L, W, H
                trajectory
            });
        }
        return parsedAgents;
    }, [data, center]);

    return (
        <group>
            {agents.map(agent => {
                const pos = agent.trajectory[frame];
                if (!pos || isNaN(pos[0])) return null; // Invalid position check
                
                return (
                    <mesh key={agent.id} position={new THREE.Vector3(pos[0], pos[1], pos[2])} rotation={[0, 0, pos[3]]}> 
                        <boxGeometry args={[agent.dims[0], agent.dims[1], agent.dims[2]]} />
                        <meshStandardMaterial color={agent.isSdc ? '#00FFFF' : getTypeColor(agent.type)} />
                    </mesh>
                );
            })}
        </group>
    );
}


function CameraRig({ data, frame, center }) {
    const { camera } = useThree();
    // We update controls target. We assume OrbitControls is available.
    // However, OrbitControls from drei does not expose itself via useThree default controls easily unless we use makeDefault.
    // If makeDefault is used, state.controls is set.
    
    // Let's find SDC trajectory once.
    const sdcTrajectory = useMemo(() => {
         const featureMap = data?.context?.featureMap;
         if (!featureMap) return null;
         
         let map;
         if (Array.isArray(featureMap)) map = new Map(featureMap);
         else map = new Map(Object.entries(featureMap || {}));

         const getVal = (key) => { 
             const feat = map.get(key);
             if (!feat) return [];
             return feat.floatList?.valueList || feat.int64List?.valueList || [];
         };
         
         const isSdcList = getVal('state/is_sdc');
         // Find SDC index
         let sdcIndex = -1;
         if (isSdcList) {
            sdcIndex = isSdcList.indexOf(Number(1));
            if (sdcIndex === -1) sdcIndex = isSdcList.findIndex(v => v == 1);
         }
         if (sdcIndex === -1) sdcIndex = 0; // Fallback
         
         const count = isSdcList.length || 1; 

         const pastX = getVal('state/past/x');
         const pastY = getVal('state/past/y');
         const pastZ = getVal('state/past/z');
         const pastLen = pastX.length / count;

         const currX = getVal('state/current/x');
         const currY = getVal('state/current/y');
         const currZ = getVal('state/current/z');
         
         const futureX = getVal('state/future/x');
         const futureY = getVal('state/future/y');
         const futureZ = getVal('state/future/z');
         const futureLen = futureX.length / count;
         
         const [cx, cy, cz] = center;
         const trajectory = [];
         
         // Past
         for (let t = 0; t < pastLen; t++) {
             const idx = sdcIndex * pastLen + t;
             trajectory.push([pastX[idx] - cx, pastY[idx] - cy, pastZ[idx] - cz]);
         }
         // Current
         trajectory.push([currX[sdcIndex] - cx, currY[sdcIndex] - cy, currZ[sdcIndex] - cz]);
         // Future
         for (let t = 0; t < futureLen; t++) {
             const idx = sdcIndex * futureLen + t;
             trajectory.push([futureX[idx] - cx, futureY[idx] - cy, futureZ[idx] - cz]);
         }
         
         return trajectory;
    }, [data, center]);

    useFrame((state) => {
        if (!sdcTrajectory) return;
        const pos = sdcTrajectory[frame];
        if (!pos || isNaN(pos[0])) return;

        // Update control target to center on car
        const ctrl = state.controls;
        if (ctrl) {
            const newTarget = new THREE.Vector3(pos[0], pos[1], pos[2]);
            
            // Calculate delta to move camera by same amount to keep relative position
            const delta = newTarget.clone().sub(ctrl.target);
            
            ctrl.target.copy(newTarget);
            camera.position.add(delta);
            ctrl.update();
        }
    });

    return null;
}

function getRoadColor(type) {
    // 1=LaneCenter-Freeway, 2=LaneCenter-Surface, 3=LaneCenter-Bike, 
    // 6=RoadLine-BrokenSingleWhite, ... 15=Crosswalk-Polygon, 16=Cyclist-Lane
    // Simplified mapping
    switch(type) {
        case 1: case 2: return 'gray';
        case 15: case 16: case 17: return 'white'; // Crosswalks
        case 6: case 7: case 8: return 'yellow'; // Dividers
        default: return '#333';
    }
}

function getTypeColor(type) {
  switch(type) {
    case 1: return '#4285F4'; // Vehicle - Blue
    case 2: return '#EA4335'; // Pedestrian - Red
    case 3: return '#FBBC04'; // Sign - Yellow
    case 4: return '#34A853'; // Cyclist - Green
    default: return 'gray';
  }
}

