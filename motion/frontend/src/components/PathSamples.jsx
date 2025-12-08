import React, { useMemo } from 'react';
import * as THREE from 'three';

function PathSamplesComponent({ vertices }) {
    const geometry = useMemo(() => {
        if (!vertices || vertices.length === 0) return null;
        
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        return geo;

    }, [vertices]);

    if (!geometry) return null;

    return (
        <lineSegments geometry={geometry}>
            <lineBasicMaterial color="#00FFFF" opacity={0.5} transparent />
        </lineSegments>
    );
}

export const PathSamples = React.memo(PathSamplesComponent);
