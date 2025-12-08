import React, { useMemo } from 'react';
import * as THREE from 'three';

function PathSamplesComponent({ map, center }) {
    const geometry = useMemo(() => {
        if (!map) return null;
        
        const getVal = (key) => {
            const feat = map.get(key);
            if (!feat) return [];
            return feat.floatList?.valueList || feat.int64List?.valueList || [];
        };
        


        const rawXyz = getVal('path_samples/xyz');
        const ids = getVal('path_samples/id');

        if (!rawXyz.length || !ids.length) return null;
        
        const [cx, cy, cz] = center;
        
        // We have a flat list of points. We need to reconstruct segments.
        // The data comes as sets of points per ID.
        // We assume they appear sequentially per ID in the arrays? 
        // Waymo data layout: path_samples is repeated field.
        // Usually, 'ids' has one entry per *point*. Wait.
        // Let's verify schema: 'path_samples/id' is length N. 'path_samples/xyz' is length 3*N.
        // Yes, each point has an ID.
        // So a path is a sequence of points with the SAME id.
        // We assume sequential ordering in the file (it is).
        
        const vertices = [];
        
        let prevId = null;
        // Keep track of previous point to form segment (prev -> curr)
        let px = 0, py = 0, pz = 0;

        for (let i = 0; i < ids.length; i++) {
            const id = ids[i];
            const x = rawXyz[i*3] - cx;
            const y = rawXyz[i*3+1] - cy;
            const z = rawXyz[i*3+2] - cz;
            
            if (id === prevId) {
                // Continuation of same path: add segment [prev, curr]
                vertices.push(px, py, pz);
                vertices.push(x, y, z);
            }
            
            // Update prev
            prevId = id;
            px = x; py = y; pz = z;
        }
        
        if (vertices.length === 0) return null;
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        return geo;

    }, [map, center]);

    if (!geometry) return null;

    return (
        <lineSegments geometry={geometry}>
            <lineBasicMaterial color="#00FFFF" opacity={0.5} transparent />
        </lineSegments>
    );
}

export const PathSamples = React.memo(PathSamplesComponent);
