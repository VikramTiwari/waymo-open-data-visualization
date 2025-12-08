import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Billboard } from '@react-three/drei';
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

// Arrow Geometry for Instancing (Merged Box + Cone, facing +X)
function createArrowGeometry() {
    // Shaft (Box)
    const shaft = new THREE.BoxGeometry(1, 0.08, 0.08);
    shaft.translate(0.5, 0, 0); // 0 to 1
    
    // Head (Cone)
    const head = new THREE.ConeGeometry(0.15, 0.4, 8);
    head.rotateZ(-Math.PI / 2); // Point to +X
    head.translate(1.2, 0, 0); // slightly after shaft end
    
    return BufferGeometryUtils.mergeGeometries([shaft, head]);
}
const ARROW_GEO = createArrowGeometry();


export function Agents({ agents, trafficLights, frameRef }) {

    // Split Agents
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

    // --- INSTANCING REFS ---
    // --- INSTANCING REFS ---
    const vehicleMeshRef = useRef();
    const vehicleArrowRef = useRef(); // New Ref for Arrows
    
    // Peds Refs
    const pedPantsRef = useRef();
    const pedShirtRef = useRef();
    const pedSkinRef = useRef();
    
    // Cyclist Refs
    const cycFrameRef = useRef();
    const cycWheelRef = useRef();
    const cycClothesRef = useRef();
    const cycSkinRef = useRef();

    // --- UPDATE LOOP ---
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
            
            TEMP_OBJECT.position.set(st.x, st.y, st.z);
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
                     if (vehicleArrowRef.current) vehicleArrowRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
                     return;
                 }
                 
                 // Update Vehicle Body
                 TEMP_OBJECT.position.set(st.x, st.y, st.z);
                 TEMP_OBJECT.rotation.set(0, 0, st.yaw);
                 TEMP_OBJECT.scale.set(agent.dims[0], agent.dims[1], agent.dims[2]);
                 TEMP_OBJECT.updateMatrix();
                 vehicleMeshRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
                 
                 const color = agent.isParked ? "#abcbfd" : getTypeColor(agent.type);
                 TEMP_COLOR.set(color);
                 vehicleMeshRef.current.setColorAt(i, TEMP_COLOR);

                 // Update Vehicle Arrow
                 if (vehicleArrowRef.current) {
                     const speed = Math.sqrt(st.vx*st.vx + st.vy*st.vy);
                     if (speed > 0.5 && !agent.isParked) {
                         const arrowYaw = Math.atan2(st.vy, st.vx);
                         TEMP_OBJECT.position.set(st.x, st.y, st.z + 2.5); // Elevate 2.5m above ground
                         TEMP_OBJECT.rotation.set(0, 0, arrowYaw);
                         // Scale length by speed, clamp min
                         const len = Math.max(speed * 0.5, 1.0);
                         TEMP_OBJECT.scale.set(len, 1, 1);
                         TEMP_OBJECT.updateMatrix();
                         vehicleArrowRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
                     } else {
                         // Hide
                         TEMP_OBJECT.scale.set(0,0,0);
                         TEMP_OBJECT.updateMatrix();
                         vehicleArrowRef.current.setMatrixAt(i, TEMP_OBJECT.matrix);
                     }
                 }
             });
             vehicleMeshRef.current.instanceMatrix.needsUpdate = true;
             if(vehicleMeshRef.current.instanceColor) vehicleMeshRef.current.instanceColor.needsUpdate = true;
             
             if (vehicleArrowRef.current) {
                 vehicleArrowRef.current.instanceMatrix.needsUpdate = true;
             }
        }

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
            });
             [cycFrameRef, cycWheelRef, cycClothesRef, cycSkinRef].forEach(r => {
                 if (r.current) {
                     r.current.instanceMatrix.needsUpdate = true;
                     if(r.current.instanceColor) r.current.instanceColor.needsUpdate = true;
                 }
            });
        }
        
        // Others (Signs etc) - Just use Box for now, instanced if we wanted, 
        // but 'others' might be heterogeneous. Let's reuse instancedVehicles logic for Unknowns?
        // Actually, we usually don't see many type 0 or 3. 
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
            
            {/* Vehicles */}
            {vehicles.length > 0 && (
                <group>
                    <instancedMesh ref={vehicleMeshRef} args={[null, null, vehicles.length]}>
                        <boxGeometry args={[1, 1, 1]} />
                        <meshStandardMaterial />
                    </instancedMesh>
                    {/* Instanced Arrows for Vehicles - Muted Color but visible */}
                    <instancedMesh ref={vehicleArrowRef} args={[ARROW_GEO, null, vehicles.length]}>
                         <meshBasicMaterial color="#999" transparent opacity={0.8} />
                    </instancedMesh>
                </group>
            )}
            
            {/* Pedestrians */}
            {peds.length > 0 && (
                <group>
                    <instancedMesh ref={pedPantsRef} args={[PED_GEOS.pantsGeo, null, peds.length]}>
                         <meshStandardMaterial color="#333" />
                    </instancedMesh>
                    <instancedMesh ref={pedShirtRef} args={[PED_GEOS.shirtGeo, null, peds.length]}>
                         <meshStandardMaterial />
                    </instancedMesh>
                    <instancedMesh ref={pedSkinRef} args={[PED_GEOS.skinGeo, null, peds.length]}>
                         <meshStandardMaterial color="#f0d5be" />
                    </instancedMesh>
                </group>
            )}
            
            {/* Cyclists */}
            {cyclists.length > 0 && (
                <group>
                    <instancedMesh ref={cycFrameRef} args={[CYC_GEOS.frameGeo, null, cyclists.length]}>
                         <meshStandardMaterial color="#555" metalness={0.8} roughness={0.3} />
                    </instancedMesh>
                    <instancedMesh ref={cycWheelRef} args={[CYC_GEOS.wheelGeo, null, cyclists.length]}>
                         <meshStandardMaterial color="#222" />
                    </instancedMesh>
                    <instancedMesh ref={cycClothesRef} args={[CYC_GEOS.clothesGeo, null, cyclists.length]}>
                          <meshStandardMaterial />
                    </instancedMesh>
                     <instancedMesh ref={cycSkinRef} args={[CYC_GEOS.skinGeo, null, cyclists.length]}>
                          <meshStandardMaterial color="#f0d5be" />
                    </instancedMesh>
                </group>
            )}
        </group>
    );
}

function AgentItem({ agent, trafficLights, frameRef }) {
    const groupRef = useRef();
    const arrowRef = useRef();
    const bodyRef = useRef();
    const bubbleRef = useRef();
    
    // Bubble Logic Refs
    const visibleRef = useRef(false);
    const lastSeenFrameRef = useRef(-100);

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

        if (arrowRef.current) {
            if (speed > 0.5) {
                arrowRef.current.visible = true;
                const arrowYaw = Math.atan2(vy, vx);
                arrowRef.current.rotation.set(0, 0, arrowYaw);
                arrowRef.current.scale.set(Math.max(speed * 0.5, 1), 1, 1);
            } else {
                arrowRef.current.visible = false;
            }
        }
        
        // --- TRAFFIC LIGHT BUBBLE LOGIC (SDC Only) ---
        if (agent.isSdc && bubbleRef.current && trafficLights) {
            // Hysteresis
            let speedCondition = false;
            if (visibleRef.current) {
                if (speed < 0.5) speedCondition = true;
            } else {
                if (speed < 0.2) speedCondition = true;
            }

            let foundRedLight = false;
            if (speedCondition) {
                const RED_STATES = [1, 4, 7];
                // Car Forward Vector
                const carFx = Math.cos(yaw);
                const carFy = Math.sin(yaw);

                // Scan lights
                for (const light of trafficLights) {
                     // Check light state at CURRENT FRAME (floor)
                     const safeLightFrame = Math.min(Math.max(0, idx1), light.trajectory.length - 1);
                     const lStep = light.trajectory[safeLightFrame];
                     const state = lStep ? lStep.state : 0;

                     if (RED_STATES.includes(state)) {
                         const dx = light.x - x;
                         const dy = light.y - y;
                         const distSq = dx*dx + dy*dy;
                         
                         // < 30m
                         if (distSq < 900) {
                             // Dot Product (FoV 120 deg)
                             const len = Math.sqrt(distSq);
                             const dot = carFx * (dx/len) + carFy * (dy/len);
                             if (dot > 0.5) {
                                 foundRedLight = true;
                                 break;
                             }
                         }
                     }
                }
            }
            
            // Debounce
            if (foundRedLight) lastSeenFrameRef.current = currentFrame;
            
            let show = false;
            if (foundRedLight) show = true;
            else if (currentFrame - lastSeenFrameRef.current < 30) show = true;

            // Strict Speed Cutoff
            if (!speedCondition && visibleRef.current) show = false;

            if (show !== visibleRef.current) {
                bubbleRef.current.visible = show;
                visibleRef.current = show;
            }
        }
    });
    
    // We need Billboard from Drei for the bubble
    // Wait, Billboard might not be imported in Agents.jsx.
    // I need to check imports.
    // Assuming I can add the bubble mesh groupRef first.

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
             {/* Velocity Arrow - Elevated */}
             <group ref={arrowRef} visible={false} position={[0, 0, 2.5]}>
                 <mesh position={[0.5, 0, 0]}>
                     <boxGeometry args={[1, 0.1, 0.1]} />
                     <meshBasicMaterial color={agent.isSdc ? "#00FFFF" : "#999"} opacity={agent.isSdc ? 1 : 0.8} transparent={!agent.isSdc} />
                 </mesh>
                 <mesh position={[1, 0, 0]} rotation={[0, 0, -Math.PI / 2]}>
                     <coneGeometry args={[0.2, 0.5, 8]} />
                     <meshBasicMaterial color={agent.isSdc ? "#00FFFF" : "#999"} opacity={agent.isSdc ? 1 : 0.8} transparent={!agent.isSdc} />
                 </mesh>
             </group>
             
             {/* SDC Thought Bubble (Attached to Group) */}
             {agent.isSdc && (
                <group ref={bubbleRef} visible={false} position={[0, 0, 2.2]}>
                    <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
                        <group scale={0.8} name="bubble-visual">
                             <mesh position={[0, 0, 0]}> 
                                 <circleGeometry args={[0.5, 32]} />
                                 <meshBasicMaterial color="white" transparent opacity={0.9} />
                             </mesh>
                             <mesh position={[0, 0, 0.01]}> 
                                <planeGeometry args={[0.4, 0.4]} />
                                <meshBasicMaterial color="red" />
                             </mesh>
                        </group>
                    </Billboard>
                </group>
             )}

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
