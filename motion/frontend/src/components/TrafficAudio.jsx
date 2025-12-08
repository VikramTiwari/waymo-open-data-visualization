import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

export function TrafficAudio({ sdcSpeeds, frameRef, isPlaying }) {
  const audioContextRef = useRef(null);
  const masterGainRef = useRef(null);
  const stemsRef = useRef([]);
  const hasStartedRef = useRef(false);

  // Initialize Audio Context and Nodes
  useEffect(() => {
    const initAudio = () => {
      if (hasStartedRef.current) return;
      
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.5; // Master volume
      master.connect(ctx.destination);
      masterGainRef.current = master;

      // Noise Buffer Generator (White Noise only for efficiency, filtered later)
      const createNoiseBuffer = () => {
        const bufferSize = 2 * ctx.sampleRate; // 2 seconds buffer
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            output[i] = Math.random() * 2 - 1;
        }
        return buffer;
      };

      const whiteBuffer = createNoiseBuffer();

      // Create distinct stems using filters
      // 1-3: Low/Engine (LowPass)
      // 4-7: Mid/Tires (BandPass)
      // 8-10: High/Wind (HighPass)
      
      const createStem = (filterType, freq, q, baseGain) => {
           const src = ctx.createBufferSource();
           src.buffer = whiteBuffer;
           src.loop = true;
           
           const filter = ctx.createBiquadFilter();
           filter.type = filterType;
           filter.frequency.value = freq;
           filter.Q.value = q;
           
           const gain = ctx.createGain();
           gain.gain.value = 0; 
           
           src.connect(filter);
           filter.connect(gain);
           gain.connect(master);
           src.start();
           
           return { src, filter, gain, baseGain };
      }

      const stems = [];

      // STEM 1: Deep Rumble (Idle) - Make Deeper
      stems.push(createStem('lowpass', 50, 2, 0.9)); 
      
      // STEM 2: Low Engine Rumble - Smoother
      stems.push(createStem('lowpass', 100, 1, 0.6));
      
      // STEM 3: Mid Engine (Growl) - Less harsh
      stems.push(createStem('bandpass', 200, 4, 0.4)); // Narrower Band (higher Q) = more tonal
      
      // STEM 4: Tire Roar (Low)
      stems.push(createStem('lowpass', 350, 1, 0.4));
      
      // STEM 5: Tire Whine (Mid)
      stems.push(createStem('bandpass', 600, 4, 0.2)); // Reduced Gain
      
      // STEM 6: Road Friction - Reduced harshness
      stems.push(createStem('lowpass', 1200, 0.5, 0.15)); // Changed to lowpass to cut hiss
      
      // STEM 7: High Tire/Asphalt Hiss - Significantly reduced
      stems.push(createStem('highpass', 2500, 0.5, 0.1)); 
      
      // STEM 8: Wind Low
      stems.push(createStem('lowpass', 250, 0.1, 0.0)); 
      
      // STEM 9: Wind Mid
      stems.push(createStem('bandpass', 600, 1, 0.0));
      
      // STEM 10: Wind High - Reduced
      stems.push(createStem('highpass', 3500, 0.5, 0.0));

      // STEM 11: City Drone (Ambient) - Deeper
      stems.push(createStem('lowpass', 70, 2, 0.4)); 

      // STEM 12: Distant Traffic (Ambient)
      stems.push(createStem('bandpass', 250, 4, 0.20));

      stemsRef.current = stems;
      hasStartedRef.current = true;
      console.log('Traffic Audio Initialized');
    };

    // Auto-start on first interaction or mount if allowed
    const handleUserInteraction = () => {
        if (!hasStartedRef.current) {
            initAudio();
        }
        if (audioContextRef.current?.state === 'suspended') {
            audioContextRef.current.resume();
        }
    };

    window.addEventListener('click', handleUserInteraction);
    return () => {
        window.removeEventListener('click', handleUserInteraction);
        if (audioContextRef.current) {
            audioContextRef.current.close();
            hasStartedRef.current = false;
        }
    };
  }, []);

  // IsPlaying Effect
  useEffect(() => {
     if (!audioContextRef.current) return;
     if (isPlaying && audioContextRef.current.state === 'suspended') {
         audioContextRef.current.resume();
     } else if (!isPlaying && audioContextRef.current.state === 'running') {
         audioContextRef.current.suspend();
     }
  }, [isPlaying]);

  // Update Loop
  useFrame(() => {
    if (!audioContextRef.current || !hasStartedRef.current) return;
    if (!sdcSpeeds || !frameRef) return;
    
    // Ensure we are running if supposed to be
    if (isPlaying && audioContextRef.current.state === 'suspended') {
         // audioContextRef.current.resume(); // Browsers might block this in loop, better to rely on effect/interaction
    }

    const currentFrame = Math.floor(frameRef.current);
    const speed = sdcSpeeds[currentFrame] !== undefined ? sdcSpeeds[currentFrame] : 0; // m/s
    const speedKmh = speed * 3.6;
    
    // Map speed to audio parameters
    // Normalizing speed factor (0 to 1 approx for 100kmh)
    const factor = Math.min(speedKmh / 100, 1.2); 
    
    stemsRef.current.forEach((stem, index) => {
        // dynamic mixing logic
        let targetGain = 0;

        if (index === 0) { // Deep Rumble (Idle)
            // Always present but masked by louder sounds
            targetGain = stem.baseGain * (1 - factor * 0.5); 
            stem.filter.frequency.value = 60 + (factor * 40); // Pitch up slightly
        }
        else if (index === 1) { // Low Engine
            // Increases with speed then plateaus
            targetGain = stem.baseGain * (0.2 + factor * 0.8);
            stem.filter.frequency.value = 100 + (factor * 150);
        }
        else if (index === 2) { // Mid Engine
             targetGain = stem.baseGain * factor;
             stem.filter.frequency.value = 240 + (factor * 300);
        }
        else if (index === 3) { // Tire Roar
             targetGain = stem.baseGain * (factor * factor); // Quadratic response
             stem.filter.frequency.value = 400 + (factor * 200);
        }
        else if (index === 4) { // Tire Whine
             if (speedKmh > 30) targetGain = stem.baseGain * Math.min(factor, 1);
             stem.filter.frequency.value = 600 + (factor * 400);
        }
        else if (index === 7) { // High Asphalt Hiss
             if (speedKmh > 50) targetGain = stem.baseGain * Math.min(factor, 1);
        }
        else if (index > 7 && index <= 9) { // Wind
             // Only active at high speeds (> 60kmh)
             if (speedKmh > 60) {
                 targetGain = 0.4 * ((speedKmh - 60) / 60); 
             }
        }
        else if (index >= 10) { 
             // Ambient Layers (Constant)
             targetGain = stem.baseGain; 
        }
        else {
             // Others
             targetGain = stem.baseGain * factor;
        }

        // Apply
        // Smooth transitions
        const timeConstant = 0.1;
        stem.gain.gain.setTargetAtTime(targetGain, audioContextRef.current.currentTime, timeConstant);
    });

  });

  return null;
}
