import React, { useMemo } from 'react';
import { Line } from '@react-three/drei';
import * as THREE from 'three';

export function RoadGraph({ data, center }) {
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
