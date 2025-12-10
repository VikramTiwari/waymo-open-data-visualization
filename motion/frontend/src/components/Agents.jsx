import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';

import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WaymoCar } from './WaymoCar';

const TEMP_OBJECT = new THREE.Object3D();
const TEMP_COLOR = new THREE.Color();

// --- GEOMETRY FACTORIES ---
// We create merged geometries for the static parts of generic agents (Pedestrians, Cyclists)
// so we can use a single InstancedMesh for each "material layer".

function createPedestrianGeometries() {
    // Mannequin style:
    const torsoHeight = 0.5;
    const legHeight = 0.85;
    const headSize = 0.22;
    
    // 1. Pants Layer (Legs) - Dark Gray
    const legL = new THREE.BoxGeometry(0.12, 0.12, legHeight);
    legL.translate(-0.1, 0, legHeight/2);
    const legR = new THREE.BoxGeometry(0.12, 0.12, legHeight);
    legR.translate(0.1, 0, legHeight/2);
    const pantsGeo = BufferGeometryUtils.mergeGeometries([legL, legR]);

    // 2. Shirt Layer (Torso + Arms) - Variable Color
    const torso = new THREE.BoxGeometry(0.35, 0.2, torsoHeight);
    torso.translate(0, 0, legHeight + torsoHeight/2);
    
    const armL = new THREE.BoxGeometry(0.1, 0.1, 0.6);
    armL.translate(-0.24, 0, legHeight + torsoHeight * 0.8 - 0.3);
    const armR = new THREE.BoxGeometry(0.1, 0.1, 0.6);
    armR.translate(0.24, 0, legHeight + torsoHeight * 0.8 - 0.3);
    
    const shirtGeo = BufferGeometryUtils.mergeGeometries([torso, armL, armR]);

    // 3. Skin Layer (Head)
    const head = new THREE.SphereGeometry(headSize/2, 8, 8); // Low poly
    head.translate(0, 0, legHeight + torsoHeight + headSize/2);
    const skinGeo = head;

    // Fix crabwalking: Rotate -90 deg to align shoulders with Y (Movement is X)
    pantsGeo.rotateZ(-Math.PI / 2);
    shirtGeo.rotateZ(-Math.PI / 2);
    skinGeo.rotateZ(-Math.PI / 2);

    return { pantsGeo, shirtGeo, skinGeo };
}

function createCyclistGeometries() {
    // Cyclist
    const wheelRadius = 0.35;
    const wheelDist = 1.05;
    const seatHeight = 0.95;
    
    // 1. Frame Layer (Metal Gray) - Frame + Handlebars + Seat Post
    // Helper to make tube geo
    const makeTube = (start, end, thick) => {
        const len = new THREE.Vector3(...start).distanceTo(new THREE.Vector3(...end));
        const cyl = new THREE.CylinderGeometry(thick, thick, len, 6);
        cyl.translate(0, len/2, 0); // pivot at bottom
        cyl.rotateX(Math.PI/2); // align to Z? No cylinder is Y.
        // We need to orient it.
        // Doing procedural orientation here is hard for merging.
        // Let's stick to simpler approximate boxes for performance/simplicity in merging?
        // Or actually construct it properly.
        // Let's use simple boxes for 'tubes' to make merging easy without complex matrix math per tube.
        const box = new THREE.BoxGeometry(thick, thick, len);
        // orient...
        const mid = new THREE.Vector3().addVectors(new THREE.Vector3(...start), new THREE.Vector3(...end)).multiplyScalar(0.5);
        const dir = new THREE.Vector3().subVectors(new THREE.Vector3(...end), new THREE.Vector3(...start));
        box.lookAt(dir); // This doesn't work on geometry directly easily.
        // Okay, use Cylinder and applyMatrix.
        const c = new THREE.CylinderGeometry(thick, thick, len, 4);
        c.rotateX(Math.PI/2); // Align to Z axis initially? Cylinder is Y up.
        // Align to direction.
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0), dir.clone().normalize());
        c.applyQuaternion(q);
        c.translate(mid.x, mid.y, mid.z);
        return c;
    };

    const frameParts = [];
    // Basic Frame
    frameParts.push(makeTube([0.25, 0, 0.75], [wheelDist*0.35, 0, 0.1], 0.04));
    frameParts.push(makeTube([0.25, 0, 0.75], [-0.15, 0, 0.1], 0.04));
    frameParts.push(makeTube([0.25, 0, 0.75], [-0.2, 0, 0.75], 0.04));
    frameParts.push(makeTube([0.25, 0, 0.8], [0.25, 0, 0.6], 0.05)); // Head
    frameParts.push(makeTube([0.25, 0, 0.6], [wheelDist/2, 0, 0], 0.03)); // Fork
    frameParts.push(makeTube([-0.2, 0, 0.75], [-wheelDist/2, 0, 0], 0.02)); // Seat stay
    frameParts.push(makeTube([-0.15, 0, 0.1], [-wheelDist/2, 0, 0], 0.02)); // Chain stay
    frameParts.push(makeTube([-0.2, 0, 0.75], [-0.22, 0, seatHeight-wheelRadius], 0.03)); // Post
    
    // Handlebar
    const handle = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 4);
    handle.rotateZ(Math.PI/2);
    handle.translate(0.3, 0, 1.0 - wheelRadius); // approx
    frameParts.push(handle);

    const frameGeo = BufferGeometryUtils.mergeGeometries(frameParts);

    // 2. Wheel Layer (Black/Dark)
    const wheel1 = new THREE.TorusGeometry(0.35, 0.02, 8, 16);
    wheel1.rotateX(Math.PI/2);
    wheel1.translate(wheelDist/2, 0, wheelRadius);
    const wheel2 = new THREE.TorusGeometry(0.35, 0.02, 8, 16);
    wheel2.rotateX(Math.PI/2);
    wheel2.translate(-wheelDist/2, 0, wheelRadius);
    const wheelGeo = BufferGeometryUtils.mergeGeometries([wheel1, wheel2]);

    // 3. Clothes Layer (Body) - Variable Color
    // Simplified rider
    const body = new THREE.BoxGeometry(0.25, 0.35, 0.6);
    body.translate(0.15, 0, seatHeight + 0.35 + 0.3); // approx pos
    // Just a box for speed
    const clothesGeo = body;

    // 4. Skin Layer (Head)
    const head = new THREE.SphereGeometry(0.12, 8, 8);
    head.translate(0.35, 0, seatHeight + 0.75);
    const skinGeo = head;

    return { frameGeo, wheelGeo, clothesGeo, skinGeo };
}

// Instantiate geometries once
const PED_GEOS = createPedestrianGeometries();
const CYC_GEOS = createCyclistGeometries();



const wireframeShaderHandler = (shader) => {
    shader.vertexShader = `
      varying vec3 vPos;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vPos = position;
      `
    );
    shader.fragmentShader = `
      varying vec3 vPos;
      ${shader.fragmentShader}
    `.replace(
      '#include <color_fragment>',
      `
      #include <color_fragment>
      float h = vPos.y + 0.5; // Map -0.5..0.5 to 0..1
      if (h > 0.97) {
        diffuseColor.a = 0.0;
      } else {
        // Gradient: Solid at bottom (0), fading rapidly to transparency at top
        // Quadratic falloff for ghostlier look
        float alphaFade = 1.0 - smoothstep(0.0, 0.95, h);
        alphaFade = pow(alphaFade, 1.5); 
        diffuseColor.a *= alphaFade;
        
        // Color: Mix with white as we go up, but keep it subtle
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), h * 0.5);
      }
      `
    );
};


// ... (previous imports)

// ... existing geometry factories ...

function createGenericCarGeometry() {
    // 1. Chassis (Bottom Box)
    // Dimensions relative to bounding box (1,1,1).
    // X=Length, Y=Width, Z=Height (Z-Up world)
    // Chassis height ~40% of total
    const chassis = new THREE.BoxGeometry(1, 1, 0.4); 
    chassis.translate(0, 0, 0.2); // Sit on ground (0..0.4)

    // 2. Cabin (Top Box)
    // We want total height to be 1.0 (Unit Height) so scaling by agent.height works.
    // Bottom sits at 0.4. Top should be at 1.0. Height = 0.6.
    const cabin = new THREE.BoxGeometry(0.6, 0.9, 0.6);
    cabin.translate(-0.1, 0, 0.7); // Sits on top (0.4 + 0.3) -> Center 0.7 extends 0.4 to 1.0

    return BufferGeometryUtils.mergeGeometries([chassis, cabin]);
}
const GENERIC_CAR_GEO = createGenericCarGeometry();

// Bottom-aligned Box for Wireframes
const BOX_GEO_BOTTOM = new THREE.BoxGeometry(1, 1, 1);
BOX_GEO_BOTTOM.translate(0, 0, 0.5);

// Brake Lights Geometry (Two small boxes at the rear)
function createBrakeLightGeometry() {
    // Relative to a 1x1x1 box centered at 0,0,0.5? No, our cars are scaled.
    // We'll trust the scaling. Car moves in +X? 
    // Usually +X is forward. So Rear is -0.5 (if length is 1).
    // Let's create two small boxes.
    const leftLight = new THREE.BoxGeometry(0.05, 0.2, 0.1);
    leftLight.translate(-0.5, 0.3, 0.4); // Rear (-x), Left (+y?), Height
    const rightLight = new THREE.BoxGeometry(0.05, 0.2, 0.1);
    rightLight.translate(-0.5, -0.3, 0.4);
    
    return BufferGeometryUtils.mergeGeometries([leftLight, rightLight]);
}
const BRAKE_LIGHT_GEO = createBrakeLightGeometry();


export function Agents({ agents, trafficLights, frameRef }) {

    // ... (split agents logic - no change) ...
    const { sdc, peds, cyclists, vehicles, others } = useMemo(() => {
        const sdcArr = [];
        const pedsArr = [];
        const cyclistsArr = [];
        const vehiclesArr = [];
        const othersArr = [];
        
        agents.forEach(agent => {
            if (agent.isSdc) {
                sdcArr.push(agent);
            } else if (agent.type === 2) { // Pedestrian
                pedsArr.push(agent);
            } else if (agent.type === 4) { // Cyclist
                cyclistsArr.push(agent);
            } else if (agent.type === 1) { // Vehicle
                vehiclesArr.push(agent);
            } else {
                othersArr.push(agent); // Unknown or signs (3)
            }
        });
        
        return { sdc: sdcArr, peds: pedsArr, cyclists: cyclistsArr, vehicles: vehiclesArr, others: othersArr };
    }, [agents]);

    // ... (refs - no change) ...
    const vehicleMeshRef = useRef();

    const vehicleWireframeRef = useRef();
    const vehicleBrakeLightRef = useRef();
    // Peds Refs
    const pedPantsRef = useRef();
    const pedShirtRef = useRef();
    const pedSkinRef = useRef();
    // Cyclist Refs
    const cycFrameRef = useRef();
    const cycWheelRef = useRef();
    const cycClothesRef = useRef();
    const cycSkinRef = useRef();
    const cycWireframeRef = useRef();


    // ... (update loop) ...
    useFrame(() => {
        if (!frameRef) return;
        const currentFrame = frameRef.current;
        
        // helper to get state
        const getAgentState = (agent) => {
            const traj = agent.trajectory;
            const idx1 = Math.floor(currentFrame);
            const idx2 = Math.min(idx1 + 1, traj.length - 1);
            const alpha = currentFrame - idx1;
            const step1 = traj[idx1];
            const step2 = traj[idx2];
            
            if (!step1) return null;
            
            let x, y, z, yaw;
            if (step2 && step1 !== step2) {
                 x = THREE.MathUtils.lerp(step1.x, step2.x, alpha);
                 y = THREE.MathUtils.lerp(step1.y, step2.y, alpha);
                 z = THREE.MathUtils.lerp(step1.z, step2.z, alpha);
                 let dYaw = step2.yaw - step1.yaw;
                 while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
                 while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
                 yaw = step1.yaw + dYaw * alpha;
            } else {
                 x = step1.x; y = step1.y; z = step1.z;
                 yaw = step1.yaw; 
            }
            return { x, y, z, yaw, valid: true };
        };
        
        const updateInstance = (idx, agent, refs, scaleOverride) => {
            const st = getAgentState(agent);
            if (!st) {
                 TEMP_OBJECT.scale.set(0,0,0);
                 TEMP_OBJECT.updateMatrix();
                 refs.forEach(r => r.current && r.current.setMatrixAt(idx, TEMP_OBJECT.matrix));
                 return;
            }
            
            // Fix Floating: Waymo Z is Centroid. Geometries are Bottom-Aligned.
            // Subtract half-height.
            const h = agent.dims[2] || 1.5;
            TEMP_OBJECT.position.set(st.x, st.y, st.z - h/2);
            
            TEMP_OBJECT.rotation.set(0, 0, st.yaw);
            if (scaleOverride) {
                 TEMP_OBJECT.scale.set(scaleOverride[0], scaleOverride[1], scaleOverride[2]);
            } else {
                 TEMP_OBJECT.scale.set(1, 1, 1);
            }
            TEMP_OBJECT.updateMatrix();
            
            refs.forEach(r => {
                if(r.current) {
                    r.current.setMatrixAt(idx, TEMP_OBJECT.matrix);
                }
            });
        };

        // Vehicles
        if (vehicleMeshRef.current) {
             vehicles.forEach((agent, i) => {
                 const st = getAgentState(agent);
                 if(!st) {
                     // Hide vehicle
                     TEMP_OBJECT.scale.set(0,0,0);
                     TEMP_OBJECT.updateMatrix();
                     vehicleMeshRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);

                     if (vehicleWireframeRef.current) vehicleWireframeRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
                     return;
                 }
                 
                 // Fix Floating: Offset Z by Half Height
                 const h = agent.dims[2];
                 TEMP_OBJECT.position.set(st.x, st.y, st.z - h/2);
                 
                 TEMP_OBJECT.rotation.set(0, 0, st.yaw);
                 
                 // Scale using correct dims (Generic Geometry normalized to 1,1,1 approx)
                 TEMP_OBJECT.scale.set(agent.dims[0], agent.dims[1], agent.dims[2]);

                 TEMP_OBJECT.updateMatrix();
                 vehicleMeshRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
                 
                 const color = agent.isParked ? "#abcbfd" : getTypeColor(agent.type);
                 TEMP_COLOR.set(color);
                 vehicleMeshRef.current.setColorAt(i, TEMP_COLOR);

                 // Update Vehicle Wireframe - Matches Body Transform
                 if (vehicleWireframeRef.current) {
                     vehicleWireframeRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
                 }



                 // Update Brake Lights
                 if (vehicleBrakeLightRef.current) {
                     // Calculate Acceleration/Braking
                     const accel = st.accel || 0;
                     const isBraking = accel < -1.0; // Threshold for braking
                     
                     // Sync Transform
                     TEMP_OBJECT.position.set(st.x, st.y, st.z - h/2);
                     TEMP_OBJECT.rotation.set(0, 0, st.yaw);
                     TEMP_OBJECT.scale.set(agent.dims[0], agent.dims[1], agent.dims[2]);
                     TEMP_OBJECT.updateMatrix();
                     vehicleBrakeLightRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);

                     // Color - Emissive Boost for Bloom
                     // Standard Red: #ff0000. 
                     // Braking: Bright Neon Red #ff0000 with high intensity? 
                     // ToneMapping might clamp, but Bloom threshold is 1.0.
                     // If we want glow, we need updates. 
                     // Actually InstancedMesh setColorAt sets the diffuse color.
                     // Emissive intensity is global in standard material.
                     // Strategy: Use a meshBasicMaterial for lights? 
                     // Or use MeshStandardMaterial with high emissive?
                     // Let's use MeshBasicMaterial.
                     // Off: Dark Red #330000
                     // On: Bright Red #ff0000 -> With Bloom it will glow if > 1.0? 
                     // RGB 1.0 is max. Bloom threshold 1.0... 
                     // We might need > 1.0 for strong bloom. 
                     // R3F: extend color ranges or use toneMapped=false?
                     // With toneMapped=false, colors > 1.0 are preserved.
                     if (isBraking) {
                        TEMP_COLOR.set('#ff0000');
                        TEMP_COLOR.multiplyScalar(5.0); // Super bright
                     } else {
                        TEMP_COLOR.set('#330000');
                     }
                     vehicleBrakeLightRef.current.setColorAt(i, TEMP_COLOR);
                 }
             });
             vehicleMeshRef.current.instanceMatrix.needsUpdate = true;
             if(vehicleMeshRef.current.instanceColor) vehicleMeshRef.current.instanceColor.needsUpdate = true;

             if (vehicleWireframeRef.current) {
                 vehicleWireframeRef.current.instanceMatrix.needsUpdate = true;
             }
             if (vehicleBrakeLightRef.current) {
                 vehicleBrakeLightRef.current.instanceMatrix.needsUpdate = true;
                 if(vehicleBrakeLightRef.current.instanceColor) vehicleBrakeLightRef.current.instanceColor.needsUpdate = true;
             }
        }

        
        // ... (peds/cyclists update - same as before) ...
        // Pedestrians
        if (peds.length > 0) {
            peds.forEach((agent, i) => {
                 updateInstance(i, agent, [pedPantsRef, pedShirtRef, pedSkinRef]);
                 // Color Update for Shirt only
                 if (pedShirtRef.current) {
                     const color = getTypeColor(agent.type); // #FF9800
                     TEMP_COLOR.set(color);
                     pedShirtRef.current.setColorAt(i, TEMP_COLOR);
                 }
            });
            [pedPantsRef, pedShirtRef, pedSkinRef].forEach(r => {
                 if (r.current) {
                     r.current.instanceMatrix.needsUpdate = true;
                     if(r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
                 }
            });
        }
        
        // Cyclists
        if (cyclists.length > 0) {
            cyclists.forEach((agent, i) => {
                 updateInstance(i, agent, [cycFrameRef, cycWheelRef, cycClothesRef, cycSkinRef]);
                 // Color Update for Clothes
                 if (cycClothesRef.current) {
                      TEMP_COLOR.set('#34A853');
                      cycClothesRef.current.setColorAt(i, TEMP_COLOR);
                 }

                 // Wireframe for Cyclist
                 if (cycWireframeRef.current && agent.dims) {
                       const st = getAgentState(agent);
                       if (st) {
                           TEMP_OBJECT.position.set(st.x, st.y, st.z + agent.dims[2] / 2); // Center on volume (assuming st.z is ground)
                           TEMP_OBJECT.rotation.set(0, 0, st.yaw);
                           TEMP_OBJECT.scale.set(agent.dims[0], agent.dims[1], agent.dims[2]);
                           TEMP_OBJECT.updateMatrix();
                           cycWireframeRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
                       } else {
                           TEMP_OBJECT.scale.set(0,0,0);
                           TEMP_OBJECT.updateMatrix();
                           cycWireframeRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
                       }
                 }
            });
             [cycFrameRef, cycWheelRef, cycClothesRef, cycSkinRef].forEach(r => {
                 if (r.current) {
                     r.current.instanceMatrix.needsUpdate = true;
                     if(r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
                 }
            });
            if (cycWireframeRef.current) {
                cycWireframeRef.current.instanceMatrix.needsUpdate = true;
            }
        }

    });

    return (
        <group>
            {/* SDC (Special) */}
            {sdc.map((agent) => (
                <AgentItem key={`sdc-${agent.id}`} agent={agent} trafficLights={trafficLights} frameRef={frameRef} />
            ))}
            
            {/* Others (Special) - fallback */}
            {others.map((agent, index) => (
                 <AgentItem key={`other-${agent.id}-${index}`} agent={agent} frameRef={frameRef} />
            ))}
            
            {/* Vehicles - Now using GENERIC_CAR_GEO */}
            {vehicles.length > 0 && (
                <group>
                    <instancedMesh ref={vehicleMeshRef} args={[GENERIC_CAR_GEO, null, vehicles.length]} frustumCulled={false}>
                        <meshPhysicalMaterial 
                            metalness={0.6} 
                            roughness={0.2} 
                            clearcoat={0.8}
                            clearcoatRoughness={0.1}
                            color="#ffffff"
                        />
                    </instancedMesh>

                    {/* Confidence Wireframe Shell */}
                    <instancedMesh ref={vehicleWireframeRef} args={[BOX_GEO_BOTTOM, null, vehicles.length]} frustumCulled={false}>
                        <meshBasicMaterial 
                             color="#00FFFF" 
                             wireframe={true} 
                             transparent={true} 
                             opacity={1.0}
                             depthWrite={false}
                             onBeforeCompile={wireframeShaderHandler}
                        />
                    </instancedMesh>
                    {/* Brake Lights - Glowing */}
                    <instancedMesh ref={vehicleBrakeLightRef} args={[BRAKE_LIGHT_GEO, null, vehicles.length]} frustumCulled={false}>
                         <meshBasicMaterial toneMapped={false} />
                    </instancedMesh>
                </group>
            )}
            
            {/* Pedestrians */}
            {peds.length > 0 && (
                <group>
                    <instancedMesh ref={pedPantsRef} args={[PED_GEOS.pantsGeo, null, peds.length]} frustumCulled={false}>
                         <meshStandardMaterial color="#333" />
                    </instancedMesh>
                    <instancedMesh ref={pedShirtRef} args={[PED_GEOS.shirtGeo, null, peds.length]} frustumCulled={false}>
                         <meshStandardMaterial />
                    </instancedMesh>
                    <instancedMesh ref={pedSkinRef} args={[PED_GEOS.skinGeo, null, peds.length]} frustumCulled={false}>
                         <meshStandardMaterial color="#f0d5be" />
                    </instancedMesh>
                </group>
            )}
            
            {/* Cyclists */}
            {cyclists.length > 0 && (
                <group>
                    <instancedMesh ref={cycFrameRef} args={[CYC_GEOS.frameGeo, null, cyclists.length]} frustumCulled={false}>
                         <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
                    </instancedMesh>
                    <instancedMesh ref={cycWheelRef} args={[CYC_GEOS.wheelGeo, null, cyclists.length]} frustumCulled={false}>
                         <meshStandardMaterial color="#222" />
                    </instancedMesh>
                    <instancedMesh ref={cycClothesRef} args={[CYC_GEOS.clothesGeo, null, cyclists.length]} frustumCulled={false}>
                          <meshStandardMaterial />
                    </instancedMesh>
                     <instancedMesh ref={cycSkinRef} args={[CYC_GEOS.skinGeo, null, cyclists.length]} frustumCulled={false}>
                          <meshStandardMaterial color="#f0d5be" />
                    </instancedMesh>
                    <instancedMesh ref={cycWireframeRef} args={[BOX_GEO_BOTTOM, null, cyclists.length]} frustumCulled={false}>
                       <meshBasicMaterial 
                            color="#34A853" 
                            wireframe={true} 
                            transparent={true} 
                            opacity={1.0}
                            depthWrite={false}
                            onBeforeCompile={wireframeShaderHandler}
                       />
                   </instancedMesh>
                </group>
            )}
        </group>
    );
}

function AgentItem({ agent, trafficLights, frameRef }) {
    const groupRef = useRef();

    const bodyRef = useRef();


    const [isBraking, setIsBraking] = React.useState(false);

    useFrame(() => {
        if (!frameRef) return;
        const currentFrame = frameRef.current;
        const traj = agent.trajectory;
        const idx1 = Math.floor(currentFrame);
        const idx2 = Math.min(idx1 + 1, traj.length - 1);
        const alpha = currentFrame - idx1;
        const step1 = traj[idx1];
        const step2 = traj[idx2];
        
        if (!step1) {
            if (groupRef.current) groupRef.current.visible = false;
            return;
        }
        if (groupRef.current) groupRef.current.visible = true;

        let x, y, z, yaw, vx, vy, accel, speed;
        
        // Linear Interpolation for smoothness
        if (step2 && step1 !== step2) {
             x = THREE.MathUtils.lerp(step1.x, step2.x, alpha);
             y = THREE.MathUtils.lerp(step1.y, step2.y, alpha);
             z = THREE.MathUtils.lerp(step1.z, step2.z, alpha);
             let dYaw = step2.yaw - step1.yaw;
             while (dYaw > Math.PI) dYaw -= 2 * Math.PI;
             while (dYaw < -Math.PI) dYaw += 2 * Math.PI;
             yaw = step1.yaw + dYaw * alpha;
             vx = THREE.MathUtils.lerp(step1.vx, step2.vx, alpha);
             vy = THREE.MathUtils.lerp(step1.vy, step2.vy, alpha);
             accel = THREE.MathUtils.lerp(step1.accel || 0, step2.accel || 0, alpha);
             // Interpolate speed for smooth logic
             speed = THREE.MathUtils.lerp(step1.speed || 0, step2.speed || 0, alpha);
        } else {
             x = step1.x; y = step1.y; z = step1.z;
             yaw = step1.yaw; vx = step1.vx; vy = step1.vy;
             accel = step1.accel || 0;
             speed = step1.speed || 0;
        }

        if (groupRef.current) groupRef.current.position.set(x, y, z);
        if (bodyRef.current) bodyRef.current.rotation.set(0, 0, yaw);

        const brakingNow = accel < -1.0;
        if (brakingNow !== isBraking) setIsBraking(brakingNow);


        
    });


    return (
        <group ref={groupRef}>
             <group ref={bodyRef}>
                {agent.isSdc ? (
                        <WaymoCar dims={agent.dims} isBraking={isBraking} />
                ) : (
                    <mesh> 
                        <boxGeometry args={[agent.dims[0], agent.dims[1], agent.dims[2]]} />
                        <meshStandardMaterial color={getTypeColor(agent.type)} />
                    </mesh>
                )}
             </group>

             


             {agent.isSdc && (
                 <mesh position={[0, 0, -0.7]} rotation={[0, 0, 0]}>
                    <ringGeometry args={[2.0, 2.5, 32]} />
                    <meshBasicMaterial color="#00FFFF" transparent opacity={0.3} side={THREE.DoubleSide} />
                 </mesh>
             )}
        </group>

    );
}

function getTypeColor(type) {
  switch(type) {
    case 1: return '#4285F4'; 
    case 2: return '#FF9800'; 
    case 3: return '#FBBC04';
    case 4: return '#34A853'; 
    default: return 'gray';
  }
}
