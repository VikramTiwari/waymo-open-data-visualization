import React, { useMemo } from 'react';
import * as THREE from 'three';
import { extend } from '@react-three/fiber';
import { shaderMaterial } from '@react-three/drei';
import earcut from 'earcut';

// Define the custom shader material
const ZebraMaterial = shaderMaterial(
    {
        uColor: new THREE.Color(0.6, 0.6, 0.6), // Dimmer white (light gray)
        uStripeWidth: 0.5, // meters
        uGapWidth: 0.5, // meters
        uOpacity: 0.4 // Faded out
    },
    // Vertex Shader
    `
    varying vec2 vUv;
    varying vec3 vPosition;
    
    void main() {
        vUv = uv;
        vPosition = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
    `,
    // Fragment Shader
    `
    uniform vec3 uColor;
    uniform float uStripeWidth;
    uniform float uGapWidth;
    uniform float uOpacity;
    
    varying vec2 vUv;
    varying vec3 vPosition;
    
    void main() {
        // We use the U coordinate which should be aligned with the "long" axis (walking direction)
        // or V coordinate depending on calibration.
        // Let's assume V is along the length (walking direction) and U is across width. 
        // Actually, we usually want stripes ACROSS the walking path.
        // So lines should be perpendicular to walking direction.
        
        // Let's rely on world position for simpler consistent stripes if UVs are hard?
        // No, world position alignment is tricky if the crosswalk is rotated.
        // We really need local coordinates aligned with the box.
        
        // Let's assume vUv.y (V) runs 0 to 1 along the LENGTH of the crosswalk.
        // We want stripes to be periodic along Y.
        
        // However, we don't pass the physical length to the shader, so UVs 0-1 don't tell us meters.
        // We need to either pass valid UVs in meters, OR pass the length as a uniform.
        
        // Let's generate UVs in METERS in the geometry phase to simplify this.
        
        float pos = vUv.y; 
        float totalPeriod = uStripeWidth + uGapWidth;
        
        // Modulo arithmetic to create stripes
        float modPos = mod(pos, totalPeriod);
        
        float alpha = uOpacity;
        
        if (modPos > uStripeWidth) {
            discard; // Gap
        }
        
        gl_FragColor = vec4(uColor, alpha);
    }
    `
);

extend({ ZebraMaterial });

export const Crosswalks = React.memo(({ crosswalks }) => {
    return (
        <group>
            {crosswalks.map((cw, i) => (
                <Crosswalk key={i} points={cw.points} />
            ))}
        </group>
    );
});

function Crosswalk({ points }) {
    const geometry = useMemo(() => {
        if (points.length < 3) return null;

        // 1. Calculate center and local covariance to find principal axes (PCA)
        const center = new THREE.Vector3();
        points.forEach(p => center.add(p));
        center.divideScalar(points.length);

        // Compute covariance matrix
        let xx = 0, xy = 0, yy = 0;
        
        // We primarily care about 2D orientation (X, Y) for stripes on the ground
        // Waymo 'Z' is up, so we look at X and Y.
        // Wait, Waymo coordinates: Z is up? Yes.
        
        const localPoints = points.map(p => p.clone().sub(center));
        
        localPoints.forEach(p => {
            xx += p.x * p.x;
            xy += p.x * p.y;
            yy += p.y * p.y;
        });

        // 2x2 Covariance Matrix for X,Y plane
        // [ xx  xy ]
        // [ xy  yy ]
        
        // Eigenvalues/vectors calculation
        // trace = xx + yy
        // det = xx*yy - xy*xy
        // lambda = (trace +/- sqrt(trace^2 - 4*det)) / 2
        
        const trace = xx + yy;
        const det = xx * yy - xy * xy;
        const term = Math.sqrt(trace * trace - 4 * det);
        const l1 = (trace + term) / 2; // Major eigenvalue
        // const l2 = (trace - term) / 2; // Minor eigenvalue

        // Major eigenvector (Direction of Max Variance - typically LENGTH of crosswalk)
        // (xx - l1)vx + xy*vy = 0  =>  vx = -xy, vy = xx - l1  (or similar)
        
        const vx = -xy;
        const vy = xx - l1;
        const len = Math.sqrt(vx * vx + vy * vy);
        
        const axisY = new THREE.Vector3(vx / len, vy / len, 0); // "Forward" / Walking direction
        const axisX = new THREE.Vector3(-axisY.y, axisY.x, 0);  // "Right" / Width direction

        // 2. Triangulate
        // Project 3D points to 2D for earcut
        // We can just use X, Y directly as it's a flat plane mostly
        const flatPoints = points.flatMap(p => [p.x, p.y]);
        const indices = earcut(flatPoints, null, 2);

        if (indices.length === 0) return null;

        // 3. Build BufferGeometry
        const vertices = [];
        const uvs = [];

        // We push vertices and calculate UVs for each
        points.forEach((p) => {
            vertices.push(p.x, p.y, p.z);
            
            // Project p onto our axes to get UVs in METERS
            // relative to center
            const vec = p.clone().sub(center);
            const u = vec.dot(axisX);
            const v = vec.dot(axisY); // Along the walking direction
            
            uvs.push(u, v);
        });

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setIndex(indices);
        geo.computeVertexNormals();

        return geo;
    }, [points]);

    if (!geometry) return null;

    return (
        <mesh geometry={geometry}>
            {/* 
               polygonOffset is crucial to prevent z-fighting with the road surface.
               factor -1 pulls it TOWARDS the camera (on top of road).
            */}
            <zebraMaterial 
                transparent 
                side={THREE.DoubleSide} 
                polygonOffset 
                polygonOffsetFactor={-1} 
            />
        </mesh>
    );
}
