import { useRef, useEffect, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const CAMERA_VARIATIONS = [
    // Top Down (Z up) - Close to Far
    [0, 0, 10], 
    [0, 0, 20], 
    [0, 0, 30], 
    [0, 0, 40], 
    [0, 0, 50],
    [0, 0, 70],
    [0, 0, 90],
    
    // Isometric - 4 corners (Close)
    [15, 15, 15],
    [-15, 15, 15],
    [15, -15, 15],
    [-15, -15, 15],
    
    // Isometric - 4 corners (Far)
    [30, 30, 30],
    [-30, 30, 30],
    [30, -30, 30],
    [-30, -30, 30],
    
    // Side / Front / Back views (Lower Z)
    [20, 0, 5],   // Behind/Front
    [-20, 0, 5],
    [0, 20, 5],   // Side
    [0, -20, 5],
    
    // Slight Angles
    [5, 5, 20],
    [-5, 5, 20],
    [5, -5, 20],
    [-5, -5, 20],
    
    // High Altitude
    [0, 0, 150],
    [10, 10, 100],
    
    // Low Angle close up
    [10, 0, 2],
    [-10, 0, 2],
    [0, 10, 2],
    [0, -10, 2],
    
    // Vertical offsets (looking slightly down but mostly top)
    [0, 10, 40],
    [0, -10, 40]
];

export { CAMERA_VARIATIONS };

export function CameraRig({ data, frame, center, variant }) {
    const { camera } = useThree();
    const initiatedRef = useRef(false);

    useEffect(() => {
        // Reset init when data or variant changes
        initiatedRef.current = false;
    }, [data, variant]);

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
            
            if (!initiatedRef.current) {
                // Apply variant offset
                const offset = CAMERA_VARIATIONS[variant] || CAMERA_VARIATIONS[0];
                camera.position.set(newTarget.x + offset[0], newTarget.y + offset[1], newTarget.z + offset[2]);
                ctrl.target.copy(newTarget);
                ctrl.update();
                initiatedRef.current = true;
            } else {
                // Calculate delta to move camera by same amount to keep relative position
                const delta = newTarget.clone().sub(ctrl.target);
                ctrl.target.copy(newTarget);
                camera.position.add(delta);
                ctrl.update();
            }
        }
    });

    return null;
}
