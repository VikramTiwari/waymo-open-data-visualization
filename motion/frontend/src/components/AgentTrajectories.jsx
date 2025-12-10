import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export function AgentTrajectories({ agents, frameRef }) {
    // We need to build a single BufferGeometry containing all trajectory lines
    // Lines are disjoint, so we can use LINE_STRIP with degenerate triangles?
    // No, for THREE.Line we need separate objects or LINE_PIECES (Lines).
    // Easiest is to use `THREE.LineSegments`.
    // For a continuous path A->B->C, segments are A-B, B-C.

    const { geometry } = useMemo(() => {
        if (!agents || agents.length === 0) return { geometry: null };

        const positions = [];
        const timestamps = []; // Store frame index for each vertex
        const colorAttr = [];
        const indices = [];

        // Helper to get color by type
        const getColor = (type, isSdc) => {
             if (isSdc) return [0, 1, 1]; // Cyan
             switch (type) {
                 case 1: return [0.2, 0.4, 1.0]; // Vehicle Blue
                 case 2: return [1.0, 0.6, 0.0]; // Pedestrian Orange
                 case 3: return [1.0, 1.0, 0.0]; // Cyclist Yellow (Sign? No 4 is cyclist)
                 case 4: return [0.2, 0.8, 0.2]; // Cyclist Green
                 default: return [0.5, 0.5, 0.5];
             }
        };

        let vertexOffset = 0;

        agents.forEach(agent => {
            // Filter: Only show trajectories for fast moving agents or SDC?
            // Showing all might be cluttered.
            // Let's show all for "Information" purpose, transparency handles clutter.

            const traj = agent.trajectory;
            if (traj.length < 2) return;

            const c = getColor(agent.type, agent.isSdc);

            for (let i = 0; i < traj.length - 1; i++) {
                const p1 = traj[i];
                const p2 = traj[i+1];

                // Add vertices
                positions.push(p1.x, p1.y, p1.z + 0.5); // Lift slightly
                positions.push(p2.x, p2.y, p2.z + 0.5);

                // Add timestamps (Frame Index)
                // We assume traj is ordered 0..N
                timestamps.push(i);
                timestamps.push(i + 1);

                // Colors
                colorAttr.push(...c);
                colorAttr.push(...c);

                // Indices
                indices.push(vertexOffset, vertexOffset + 1);
                vertexOffset += 2;
            }
        });

        if (positions.length === 0) return { geometry: null };

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.setAttribute('aTimestamp', new THREE.Float32BufferAttribute(timestamps, 1));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colorAttr, 3));
        // We don't need indices if we just draw arrays, but LineSegments uses drawArrays if no index?
        // Actually setIndex is better.
        geo.setIndex(indices);

        return { geometry: geo };

    }, [agents]);

    // Shader Material Ref
    const materialRef = useRef();

    useFrame(() => {
        if (!materialRef.current || !frameRef) return;
        materialRef.current.uniforms.uCurrentFrame.value = frameRef.current;
    });

    if (!geometry) return null;

    return (
        <lineSegments geometry={geometry} frustumCulled={false}>
             <shaderMaterial
                ref={materialRef}
                uniforms={{
                    uCurrentFrame: { value: 0 },
                    uTotalFrames: { value: 91 }
                }}
                vertexShader={`
                    attribute float aTimestamp;
                    attribute vec3 color;
                    varying float vAlpha;
                    varying vec3 vColor;
                    uniform float uCurrentFrame;

                    void main() {
                        vColor = color;
                        vec3 pos = position;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);

                        // Current Frame Logic
                        float diff = aTimestamp - uCurrentFrame;

                        // We only show future paths
                        // Point must be >= Current Frame

                        if (diff < -1.0) {
                            // Strictly past
                            vAlpha = 0.0;
                        } else {
                            // Future fade
                            // diff goes from 0 to ~80
                            float maxFuture = 80.0;
                            float fade = 1.0 - clamp(diff / maxFuture, 0.0, 1.0);
                            vAlpha = pow(fade, 2.0); // Quadratic falloff

                            // Near-field fade-in (prevent popping)
                            if (diff < 0.0) {
                                // interpolate between -1 and 0 (current segment being traversed)
                                vAlpha *= (1.0 + diff);
                            }
                        }
                    }
                `}
                fragmentShader={`
                    varying float vAlpha;
                    varying vec3 vColor;

                    void main() {
                        if (vAlpha <= 0.01) discard;
                        gl_FragColor = vec4(vColor, vAlpha * 0.6);
                    }
                `}
                transparent={true}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
             />
        </lineSegments>
    );
}
