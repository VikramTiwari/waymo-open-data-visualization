import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

export function PathSamples({ data, center }) {
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

        const xyz = getVal('context/path_samples/xyz'); // Note: schema says 'context/path_samples/xyz', but usually keys are relative to context? 
        // Wait, schema.json showed keys like "path_samples/xyz" directly under "context", but the keys in the map usually match the string literal in keys.
        // Let's check schema again. The schema has "context": { "path_samples/xyz": ... }.
        // So the key in the map should be "path_samples/xyz" if we are looking at the whole features map, OR potentially just "path_samples/xyz".
        // In Agents.jsx we utilize "state/current/x". Access pattern suggests we use the full key.
        // Let's try both or stick to what we saw in schema.json lines 3-12.
        
        // Schema keys:
        // "path_samples/arc_length"
        // "path_samples/id"
        // ...
        // "roadgraph_samples/xyz"
        
        // So we will use "path_samples/xyz"
        
        const rawXyz = getVal('path_samples/xyz');
        const ids = getVal('path_samples/id');
        const valids = getVal('path_samples/valid');

        if (!rawXyz.length || !ids.length) return [];
        
        const segments = {};
        const [cx, cy, cz] = center;

        // Path samples are often just points. We need to group them by ID to form lines.
        // Usually, all points for one path are contiguous? Or interleaved?
        // In Waymo dataset, "path_samples/id" has same length as "path_samples/xyz" points count? 
        // No, xyz is flat list of coordinates (3x points). ID is per point.
        
        // Let's verify lengths.
        // xyz.length should be 3 * ids.length
        
        for (let i = 0; i < ids.length; i++) {
            // Check validity if needed (valid[i] === 1)
            // if (valids[i] === 0) continue; // Optional, sometimes 0 is still useful debug data
            
            const id = ids[i];
            if (!segments[id]) {
                segments[id] = [];
            }
            
            const x = rawXyz[i*3] - cx;
            const y = rawXyz[i*3+1] - cy;
            const z = rawXyz[i*3+2] - cz;
            
            segments[id].push(new THREE.Vector3(x, y, z));
        }
        
        // Filter out single points, need at least 2 for a line?
        // Actually points might be valid too but hard to see.
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
