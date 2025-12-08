import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

function PathSamplesComponent({ data, center }) {
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

        // Schema keys:
        // "path_samples/arc_length"
        // "path_samples/id"
        // ...
        // "roadgraph_samples/xyz"
        
        // So we will use "path_samples/xyz"
        
        const rawXyz = getVal('path_samples/xyz');
        const ids = getVal('path_samples/id');

        if (!rawXyz.length || !ids.length) return [];
        
        const segments = {};
        const [cx, cy, cz] = center;

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            if (!segments[id]) {
                segments[id] = [];
            }
            
            const x = rawXyz[i*3] - cx;
            const y = rawXyz[i*3+1] - cy;
            const z = rawXyz[i*3+2] - cz;
            
            segments[id].push(new THREE.Vector3(x, y, z));
        }
        
        return Object.values(segments).filter(pts => pts.length > 1);

    }, [data, center]);

    return (
        <group>
            {lines.map((points, idx) => (
                <Line 
                    key={idx} 
                    points={points} 
                    color="#00FFFF" // Cyan
                    opacity={0.5}
                    transparent
                    lineWidth={1} 
                />
            ))}
        </group>
    );
}

export const PathSamples = React.memo(PathSamplesComponent);
