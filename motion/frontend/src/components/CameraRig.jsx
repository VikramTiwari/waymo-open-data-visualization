import { useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const BASE_MODES = [
    // Standard Follows
    { name: 'Follow (High)', type: 'follow', offset: [0, -5, 10], lookAtOffset: [0, 5, 0] },
    { name: 'Follow (Low)', type: 'follow', offset: [0, -8, 2], lookAtOffset: [0, 5, 1] },
    
    // Technical / Mechanical
    { name: 'Roof Cam (T-Cam)', type: 'relative', offset: [0, 0, 1.8], lookAtOffset: [0, 20, 0] }, // High enough to clear roof
    { name: 'Under-Chassis', type: 'relative', offset: [0, 1.5, 0.3], lookAtOffset: [0, 10, 0.3] }, // Very low, forward
    { name: 'Wheel Cam', type: 'relative', offset: [1.1, 0.8, 0.4], lookAtOffset: [1.1, 5, 0.4] },
    
    // Interior / POV
    { name: 'Driver POV', type: 'relative', offset: [-0.4, 0.2, 1.1], lookAtOffset: [0, 10, 1] },
    { name: 'Passenger Seat', type: 'relative', offset: [0.4, 0.2, 1.1], lookAtOffset: [0, 10, 1] },
    
    // Broadcast / Cinemtic
    { name: 'TV Helicopter', type: 'follow', offset: [15, -15, 15], lookAtOffset: [0, 10, 0] },
    { name: 'Reverse Chase', type: 'relative', offset: [0, 10, 2], lookAtOffset: [0, -10, 1] },
    { name: 'Cinematic Pan', type: 'fixed_track' }, // Logic handles position
    { name: 'Spider Cam', type: 'orbit', radius: 20, height: 15, speed: 0.3 }, // Sweeping high angle

    // Stylized
    { name: 'Isometric (Arcade)', type: 'isometric', offset: [20, -20, 20] }, // Fixed world offset
    { name: 'Top Down (Static)', type: 'static_top', height: 40 },
];

export function CameraRig({ data, frameRef, center, variant }) {
    const { camera } = useThree();
    
    // 1. Analyze Scenario (SDC + Pedestrians)
    const scenarioData = useMemo(() => {
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
         let sdcIndex = -1;
         if (isSdcList) {
            sdcIndex = isSdcList.indexOf(Number(1)); 
            if (sdcIndex === -1) sdcIndex = isSdcList.findIndex(v => v == 1);
         }
         if (sdcIndex === -1) sdcIndex = 0;
         
         const count = isSdcList.length || 1; 

         const currSpeeds = getVal('state/current/speed');
         const sdcSpeed = currSpeeds[sdcIndex] || 0; 
         const isStopped = sdcSpeed < 2.0;

         const types = getVal('state/type');
         const pedestrianIndices = [];
         if (types) {
             types.forEach((t, idx) => {
                 if (t === 2) pedestrianIndices.push(idx); 
             });
         }
         
         // Get initial position for Fixed cameras?
         // We can extract SDC start pos here if needed.
         const startX = getVal('state/current/x')[sdcIndex] || 0;
         const startY = getVal('state/current/y')[sdcIndex] || 0;

         return {
             map,
             sdcIndex,
             count,
             isStopped,
             pedestrianIndices,
             sdcStart: [startX, startY]
         };
    }, [data]); 

    // 2. Select Mode
    const activeMode = useMemo(() => {
        if (!scenarioData) return BASE_MODES[0];

        let availableModes = [...BASE_MODES];
        
        if (scenarioData.isStopped && scenarioData.pedestrianIndices.length > 0) {
            for(let i=0; i<3; i++) {
                availableModes.push({ 
                    name: 'Pedestrian POV', 
                    type: 'pedestrian', 
                    targetIndex: scenarioData.pedestrianIndices[i % scenarioData.pedestrianIndices.length] 
                });
            }
        }

        const idx = variant % availableModes.length;
        const selected = availableModes[idx];
        
        // If Fixed Track, we need to pick a spot relative to Start
        // But we want it to be somewhat random per scenario play.
        // We'll attach the fixed position to the mode object clone or a ref.
        // Since useMemo runs on variant change (reset), we can generate it here.
        if (selected.type === 'fixed_track') {
            const [sx, sy] = scenarioData.sdcStart;
            // Pick a spot ahead/side
            // Randomize slightly? Use variant as seed for offset?
            const offsetX = (variant % 2 === 0 ? 1 : -1) * (15 + (variant % 10));
            const offsetY = 15 + (variant % 5);
            // We need to account that we center the scene at [cx, cy].
            // The camera rig receives `center`. 
            // The positions in update loop are relative to center.
            // So we just need an offset relative to SDC start.
            
            return { 
                ...selected, 
                fixedPos: new THREE.Vector3(sx + offsetX, sy + offsetY, 5) // We'll adjust for center in loop
            };
        }

        return selected;

    }, [scenarioData, variant]);

    // 3. Parse Trajectories
    const trajectories = useMemo(() => {
        if (!scenarioData) return null;
        const { map, sdcIndex, count } = scenarioData;

        const getTraj = (agentIndex, valKey) => {
             const getVal = (key) => {
                 const feat = map.get(key);
                 if (!feat) return [];
                 return feat.floatList?.valueList || feat.int64List?.valueList || [];
             };
             const past = getVal(`state/past/${valKey}`);
             const curr = getVal(`state/current/${valKey}`);
             const future = getVal(`state/future/${valKey}`);
             
             const pastLen = past.length / count;
             const futureLen = future.length / count;
             
             const vals = [];
             for(let t=0; t<pastLen; t++) vals.push(past[agentIndex * pastLen + t]);
             vals.push(curr[agentIndex]);
             for(let t=0; t<futureLen; t++) vals.push(future[agentIndex * futureLen + t]);
             return vals;
        };

        const parseAgent = (idx) => {
            const xs = getTraj(idx, 'x');
            const ys = getTraj(idx, 'y');
            const zs = getTraj(idx, 'z');
            const yaws = getTraj(idx, 'bbox_yaw'); 
            const [cx, cy, cz] = center;
            
            return xs.map((x, i) => ({
                 pos: new THREE.Vector3(x - cx, ys[i] - cy, zs[i] - cz),
                 yaw: yaws[i] || 0
            }));
        };

        const sdcTraj = parseAgent(sdcIndex);
        
        let pedTraj = null;
        if (activeMode.type === 'pedestrian' && activeMode.targetIndex !== undefined) {
            pedTraj = parseAgent(activeMode.targetIndex);
        }

        return { sdc: sdcTraj, ped: pedTraj };

    }, [scenarioData, activeMode, center]);

    // 4. Animation Loop
    useFrame((state) => {
        if (!trajectories || !frameRef) return;
        
        const currentFrame = frameRef.current;
        const idx1 = Math.floor(currentFrame);
        if (idx1 >= trajectories.sdc.length) return;
        const idx2 = Math.min(idx1 + 1, trajectories.sdc.length - 1);
        const alpha = currentFrame - idx1;
        
        const interpolate = (traj) => {
            const s1 = traj[idx1];
            const s2 = traj[idx2];
            if (!s1) return { pos: new THREE.Vector3(), yaw: 0 };
            
            const p = new THREE.Vector3();
            let y = s1.yaw;
            
            if (s2 && s1 !== s2) {
                p.lerpVectors(s1.pos, s2.pos, alpha);
                let dYaw = s2.yaw - s1.yaw;
                while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
                while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
                y = s1.yaw + dYaw * alpha;
            } else {
                p.copy(s1.pos);
            }
            return { pos: p, yaw: y };
        };
        
        const carState = interpolate(trajectories.sdc);
        
        const controls = state.controls;
        if (!controls) return;

        let targetPos = carState.pos.clone();
        let camPos = new THREE.Vector3();

        if (activeMode.type === 'pedestrian' && trajectories.ped) {
             const pedState = interpolate(trajectories.ped);
             camPos.copy(pedState.pos);
             camPos.z += 1.7; 
             targetPos.copy(carState.pos);
             targetPos.z += 1.0; 

        } else if (activeMode.type === 'fixed_track') {
             // Fixed Position in World
             // Needs to be relative to Center
             const [cx, cy, cz] = center;
             // activeMode.fixedPos was calculated raw.
             // We need to subtract center from it.
             // Wait, where did we calculate it? In useMemo.
             // The useMemo had access to raw start coords.
             // So fixedPos is raw global.
             
             if (activeMode.fixedPos) {
                 camPos.set(
                     activeMode.fixedPos.x - cx,
                     activeMode.fixedPos.y - cy,
                     activeMode.fixedPos.z - cz
                 );
             } else {
                 // Fallback
                 camPos.set(10, 10, 5); 
             }
             targetPos.copy(carState.pos);

        } else if (activeMode.type === 'isometric') {
             // Position relative to target, but NO rotation.
             // Just World Offset.
             camPos.copy(carState.pos)
                   .add(new THREE.Vector3(...activeMode.offset));
             targetPos.copy(carState.pos);
             
        } else {
            // Standard Modes
            const time = state.clock.getElapsedTime();
            const carPos = carState.pos;
            const carYaw = carState.yaw;
             
            const forward = new THREE.Vector3(Math.cos(carYaw), Math.sin(carYaw), 0);
            const right = new THREE.Vector3(Math.sin(carYaw), -Math.cos(carYaw), 0);
            const up = new THREE.Vector3(0, 0, 1);

            switch (activeMode.type) {
                case 'follow': {
                    camPos.copy(carPos)
                        .addScaledVector(right, activeMode.offset[0]) 
                        .addScaledVector(forward, activeMode.offset[1])
                        .addScaledVector(up, activeMode.offset[2]);     
                    targetPos.addScaledVector(right, activeMode.lookAtOffset?.[0] || 0)
                            .addScaledVector(forward, activeMode.lookAtOffset?.[1] || 0)
                            .addScaledVector(up, activeMode.lookAtOffset?.[2] || 0);
                    break;
                }
                case 'relative': {
                    camPos.copy(carPos)
                        .addScaledVector(right, activeMode.offset[0])
                        .addScaledVector(forward, activeMode.offset[1])
                        .addScaledVector(up, activeMode.offset[2]); 
                    targetPos.addScaledVector(right, activeMode.lookAtOffset?.[0] || 0)
                            .addScaledVector(forward, activeMode.lookAtOffset?.[1] || 0)
                            .addScaledVector(up, activeMode.lookAtOffset?.[2] || 0);
                    break;
                }
                case 'orbit': {
                    const theta = time * activeMode.speed;
                    const r = activeMode.radius;
                    camPos.set(
                        carPos.x + r * Math.cos(theta),
                        carPos.y + r * Math.sin(theta),
                        carPos.z + activeMode.height
                    );
                    targetPos.copy(carPos);
                    break;
                }
                case 'static_top': {
                    // Offset Y slightly to avoid LookAt(0,0,-1) || Up(0,0,1) singularity
                    camPos.set(carPos.x, carPos.y - 0.01, carPos.z + activeMode.height);
                    targetPos.copy(carPos); 
                    break;
                }
                default: {
                    camPos.set(carPos.x - 10, carPos.y - 10, carPos.z + 10);
                    targetPos.copy(carPos);
                }
            }
        }
        
        controls.target.lerp(targetPos, 0.5); 
        if (camPos.distanceTo(targetPos) < 0.1) camPos.z += 1;
        
        // For 'fixed_track', we want strict position, no interpolated lag?
        // Actually smooth lookat is fine, but position is static.
        // lerp is fine if target is static (it converts to static quick).
        camera.position.lerp(camPos, 0.5); 
        controls.update();
    });

    return null;
}
