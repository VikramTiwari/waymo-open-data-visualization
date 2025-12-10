import React, { useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export function Lightning() {
    const lightRef = useRef();
    const [intensity, setIntensity] = useState(0);

    // Config
    const flashDuration = 0.15; // seconds
    const flashInterval = 5; // average seconds between flashes
    
    // State to track next flash
    const nextFlashTime = useRef(0);
    
    // Init first flash time
    React.useEffect(() => {
        nextFlashTime.current = Math.random() * flashInterval;
    }, []);
    const isFlashing = useRef(false);
    const flashStartTime = useRef(0);

    useFrame((state) => {
        const time = state.clock.elapsedTime;

        if (!isFlashing.current) {
            // Waiting to flash
            if (time >= nextFlashTime.current) {
                isFlashing.current = true;
                flashStartTime.current = time;
                // Schedule next
                nextFlashTime.current = time + Math.random() * flashInterval + 2; 
            }
        } 
        
        if (isFlashing.current) {
             const age = time - flashStartTime.current;
             if (age > flashDuration) {
                 isFlashing.current = false;
                 setIntensity(0);
             } else {
                 // Flicker logic
                 // 3 peak pulses
                 const envelope = Math.sin((age / flashDuration) * Math.PI);
                 const jitter = Math.random() > 0.5 ? 1 : 0; 
                 // Super bright flash
                 setIntensity(envelope * 50 * jitter); 
             }
        }
    });

    return (
        <>
           {/* Global Flash */}
           {intensity > 0 && (
               <directionalLight
                   ref={lightRef}
                   position={[100, 100, 100]} // High up
                   intensity={intensity}
                   color="#aaddff"
                   castShadow={false}
               />
           )}
           {/* Ambient boost mostly for shadows area */}
           {intensity > 0 && <ambientLight intensity={intensity * 0.1} color="#ffffff" />}
        </>
    );
}
