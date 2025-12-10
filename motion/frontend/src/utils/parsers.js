
export const ENVS = {
    night: '/dikhololo_night_1k.hdr?v=1',
    city: '/potsdamer_platz_1k.hdr?v=1',
    town: '/blaubeuren_night_1k.hdr',
    rooftop: '/rooftop_night_1k.hdr',
    dark: '/moonless_golf_1k.hdr',
    shanghai: '/shanghai_bund_1k.hdr',
    rogland: '/rogland_clear_night_1k.hdr',
    studio: '/studio_small_09_1k.hdr',
    sunrise: '/spruit_sunrise_1k.hdr',
    street: '/urban_street_01_1k.hdr',
    garage: '/autoshop_01_1k.hdr',
    parking: '/parking_garage_1k.hdr',
    sunset: '/venice_sunset_1k.hdr',
    bridge: '/adams_place_bridge_1k.hdr',
    market: '/leadenhall_market_1k.hdr'
};

export function parseData(data) {
    if (!data) return null;

    // 1. Parse Map
    const featureMap = data?.context?.featureMap;
    let map;
    if (Array.isArray(featureMap)) {
         if (featureMap.length > 0 && Array.isArray(featureMap[0])) {
             map = new Map(featureMap);
         } else if (featureMap.length > 0 && typeof featureMap[0] === 'object') {
             map = new Map(featureMap.map(e => [e.key, e.value]));
         } else {
             map = new Map();
         }
    } else {
        map = new Map(Object.entries(featureMap || {}));
    }

    // 2. Parse Center
    const sdcList = map.get('state/is_sdc')?.int64List?.valueList;
    const xList = map.get('state/current/x')?.floatList?.valueList;
    const yList = map.get('state/current/y')?.floatList?.valueList;
    const zList = map.get('state/current/z')?.floatList?.valueList;

    let center = [0, 0, 0];
    if (xList && yList) {
        let sdcIndex = -1;
        if (sdcList) {
            sdcIndex = sdcList.indexOf(Number(1));
            if (sdcIndex === -1) sdcIndex = sdcList.findIndex(v => v == 1);
        }
        if (sdcIndex === -1) sdcIndex = 0;
        center = [xList[sdcIndex] || 0, yList[sdcIndex] || 0, zList[sdcIndex] || 0];
    }

    // 3. Scenario ID
    const idVal = map.get('scenario/id')?.bytesList?.valueList?.[0];
    const scenarioId = idVal ? String(idVal) : 'Unknown';

    // 4. SDC Speeds
    const sdcSpeeds = parseSdcSpeeds(map, sdcList);

    // 5. Agents
    const agents = parseAgents(map, center);

    // 6. Traffic Lights
    const trafficLights = parseTrafficLights(map, center);

    // 7. Path Samples
    const pathSamples = parsePathSamples(map, center);

    // 8. SDC State
    const sdcState = parseSdcState(map, center);

    // 9. Random Visuals
    const keys = Object.keys(ENVS);
    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    const envFile = ENVS[randomKey];

    const r = Math.random();
    let weather = 'clear';
    if (r > 0.8) {
        const types = ['rain', 'snow', 'fog', 'dust', 'storm'];
        weather = types[Math.floor(Math.random() * types.length)];
    }

    const variant = Math.floor(Math.random() * 100);

    return {
        map, // keeping map just in case components use it directly
        center,
        scenarioId,
        sdcSpeeds,
        agents,
        trafficLights,
        pathSamples,
        sdcState,
        meta: {
            envName: randomKey,
            envFile,
            weather,
            variant
        }
    };
}

function parseSdcSpeeds(map, sdcList) {
    if (!sdcList) return [];

    let sdcIndex = sdcList.indexOf(Number(1));
    if (sdcIndex === -1) sdcIndex = sdcList.findIndex(v => v == 1);
    if (sdcIndex === -1) return [];

    const getVal = (key) => map.get(key)?.floatList?.valueList || [];

    const pastVx = getVal('state/past/velocity_x');
    const pastVy = getVal('state/past/velocity_y');
    const currVx = getVal('state/current/velocity_x');
    const currVy = getVal('state/current/velocity_y');
    const futureVx = getVal('state/future/velocity_x');
    const futureVy = getVal('state/future/velocity_y');

    const count = sdcList.length;
    const pastLen = pastVx.length / count;
    const futureLen = futureVx.length / count;

    const speeds = [];

    // Past
    for (let t = 0; t < pastLen; t++) {
        const idx = sdcIndex * pastLen + t;
        const vx = pastVx[idx] || 0;
        const vy = pastVy[idx] || 0;
        speeds.push(Math.sqrt(vx*vx + vy*vy));
    }
    // Current
    {
        const vx = currVx[sdcIndex] || 0;
        const vy = currVy[sdcIndex] || 0;
        speeds.push(Math.sqrt(vx*vx + vy*vy));
    }
    // Future
    for (let t = 0; t < futureLen; t++) {
        const idx = sdcIndex * futureLen + t;
        const vx = futureVx[idx] || 0;
        const vy = futureVy[idx] || 0;
        speeds.push(Math.sqrt(vx*vx + vy*vy));
    }
    return speeds;
}

function parseAgents(map, center) {
    const getVal = (key) => {
        const feat = map.get(key);
        if (!feat) return [];
        return feat.floatList?.valueList || feat.int64List?.valueList || [];
    };

    const ids = getVal('state/id');
    const count = ids.length;
    if (count === 0) return [];

    const pastX = getVal('state/past/x');
    const pastY = getVal('state/past/y');
    const pastZ = getVal('state/past/z');
    const pastYaw = getVal('state/past/bbox_yaw');
    const pastVx = getVal('state/past/velocity_x');
    const pastVy = getVal('state/past/velocity_y');

    const currX = getVal('state/current/x');
    const currY = getVal('state/current/y');
    const currZ = getVal('state/current/z');
    const currYaw = getVal('state/current/bbox_yaw');
    const currVx = getVal('state/current/velocity_x');
    const currVy = getVal('state/current/velocity_y');

    const futureX = getVal('state/future/x');
    const futureY = getVal('state/future/y');
    const futureZ = getVal('state/future/z');
    const futureYaw = getVal('state/future/bbox_yaw');
    const futureVx = getVal('state/future/velocity_x');
    const futureVy = getVal('state/future/velocity_y');

    const width = getVal('state/current/width');
    const length = getVal('state/current/length');
    const height = getVal('state/current/height');
    const type = getVal('state/type');
    const isSdcList = getVal('state/is_sdc');

    const pastLen = pastX.length / count;
    const futureLen = futureX.length / count;

    const [cx, cy, cz] = center;

    // RoadGraph for Parked Detection
    const mapX = getVal('roadgraph_samples/xyz');
    const mapType = getVal('roadgraph_samples/type');
    const lanePoints = [];
    if (mapX && mapType) {
        for(let i=0; i<mapType.length; i++) {
            if (mapType[i] === 1 || mapType[i] === 2) {
                lanePoints.push({
                    x: mapX[i*3] - cx,
                    y: mapX[i*3+1] - cy,
                    z: mapX[i*3+2] - cz
                });
            }
        }
    }

    const agents = [];
    for (let i = 0; i < count; i++) {
        const trajectory = [];

        const pushStep = (rawX, rawY, rawZ, rawYaw, rawVx, rawVy) => {
             const vx = rawVx || 0;
             const vy = rawVy || 0;
             trajectory.push({
                x: rawX - cx,
                y: rawY - cy,
                z: rawZ - cz,
                yaw: rawYaw || 0,
                vx: vx,
                vy: vy,
                speed: Math.sqrt(vx*vx + vy*vy)
            });
        };

        for (let t = 0; t < pastLen; t++) {
            const idx = i * pastLen + t;
            pushStep(pastX[idx], pastY[idx], pastZ[idx], pastYaw[idx], pastVx[idx], pastVy[idx]);
        }

        pushStep(currX[i], currY[i], currZ[i], currYaw[i], currVx[i], currVy[i]);

        for (let t = 0; t < futureLen; t++) {
            const idx = i * futureLen + t;
            pushStep(futureX[idx], futureY[idx], futureZ[idx], futureYaw[idx], futureVx[idx], futureVy[idx]);
        }

        // Accel calc
        for (let t = 0; t < trajectory.length - 1; t++) {
            const step = trajectory[t];
            const next = trajectory[t + 1];
            const speedCurr = Math.sqrt(step.vx*step.vx + step.vy*step.vy);
            const speedNext = Math.sqrt(next.vx*next.vx + next.vy*next.vy);
            const accel = (speedNext - speedCurr) / 0.1;
            step.accel = accel;
        }

        let maxSpeed = 0;
        for(const step of trajectory) {
            const s = Math.sqrt(step.vx*step.vx + step.vy*step.vy);
            if (s > maxSpeed) maxSpeed = s;
        }

        let isParked = false;
        if (type[i] === 1 && maxSpeed < 0.5) {
            const startPos = trajectory[0];
            let minDist = Infinity;
            if (lanePoints.length > 0) {
                 for (let k = 0; k < lanePoints.length; k += 5) {
                    const lp = lanePoints[k];
                    const dx = lp.x - startPos.x;
                    const dy = lp.y - startPos.y;
                    const d = dx*dx + dy*dy;
                    if (d < minDist) minDist = d;
                    if (d < 4.0) break;
                }
                if (minDist > 4.0) isParked = true;
            }
        }

        const isSdc = isSdcList && isSdcList[i] == 1;

        agents.push({
            id: ids[i],
            type: type[i],
            isSdc: isSdc,
            isParked: isParked,
            dims: [length[i], width[i], height[i] || 1.5],
            trajectory
        });
    }
    return agents;
}

function parseTrafficLights(map, center) {
    const getVal = (key) => {
        const feat = map.get(key);
        if (!feat) return [];
        return feat.floatList?.valueList || feat.int64List?.valueList || [];
    };

    const ids = getVal('traffic_light_state/current/id');
    const count = ids.length;
    if (count === 0) return [];

    const currentStates = getVal('traffic_light_state/current/state');
    const currentX = getVal('traffic_light_state/current/x');
    const currentY = getVal('traffic_light_state/current/y');
    const currentZ = getVal('traffic_light_state/current/z');
    const currentValid = getVal('traffic_light_state/current/valid');

    const pastStates = getVal('traffic_light_state/past/state');
    const pastValid = getVal('traffic_light_state/past/valid');

    const futureStates = getVal('traffic_light_state/future/state');
    const futureValid = getVal('traffic_light_state/future/valid');

    const pastLen = pastStates.length > 0 ? (pastStates.length / count) : 0;
    const futureLen = futureStates.length > 0 ? (futureStates.length / count) : 0;

    const [cx, cy, cz] = center;

    // RoadGraph samples for orientation
    const mapIds = getVal('roadgraph_samples/id');
    const mapDir = getVal('roadgraph_samples/dir');
    const mapX = getVal('roadgraph_samples/xyz');

    // Build efficient lookup for map samples
    const samplesById = new Map();
    if (mapIds && mapDir && mapX) {
        for(let i=0; i<mapIds.length; i++) {
             const id = mapIds[i];
             if(!samplesById.has(id)) {
                 samplesById.set(id, []);
             }
             samplesById.get(id).push(i);
        }
    }

    const parsedLights = [];

    for (let i = 0; i < count; i++) {
        if (currentValid && currentValid[i] === 0) continue;

        const x = (currentX[i] || 0) - cx;
        const y = (currentY[i] || 0) - cy;
        const z = (currentZ[i] || 0) - cz;

        // Orientation
        // Find nearest roadgraph sample with same ID
        let yaw = 0;
        const sIndices = samplesById.get(ids[i]);
        if (sIndices) {
            let minDist = Infinity;
            let bestIdx = -1;
            for(const idx of sIndices) {
                const mx = mapX[idx*3] - cx;
                const my = mapX[idx*3+1] - cy;
                const mz = mapX[idx*3+2] - cz;
                const d = (mx-x)*(mx-x) + (my-y)*(my-y) + (mz-z)*(mz-z);
                if (d < minDist) {
                    minDist = d;
                    bestIdx = idx;
                }
            }

            if (bestIdx !== -1) {
                const dx = mapDir[bestIdx*3];
                const dy = mapDir[bestIdx*3+1];
                // Traffic flows in (dx, dy). Light faces oncoming traffic.
                // So Light Yaw = Lane Yaw + PI
                yaw = Math.atan2(dy, dx) + Math.PI;
            }
        }

        const trajectory = [];

        // Past
        for (let t = 0; t < pastLen; t++) {
            const idx = i * pastLen + t;
             if (pastValid && pastValid[idx] === 0) {
                 trajectory.push(null);
                 continue;
             }
            trajectory.push({
                state: pastStates[idx],
            });
        }

        // Current
        trajectory.push({
            state: currentStates[i]
        });

        // Future
        for (let t = 0; t < futureLen; t++) {
            const idx = i * futureLen + t;
            if (futureValid && futureValid[idx] === 0) {
                 trajectory.push(null);
                 continue;
             }
            trajectory.push({
                state: futureStates[idx]
            });
        }

        parsedLights.push({
            id: ids[i],
            x, y, z,
            yaw,
            trajectory
        });
    }

    // Dedup / Cluster
    const uniqueLights = [];
    const seenPos = [];

    for (const light of parsedLights) {
        let duplicate = false;
        for (const sp of seenPos) {
            const dx = sp.x - light.x;
            const dy = sp.y - light.y;
            const dz = sp.z - light.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (dist < 0.2) {
                duplicate = true;
                break;
            }
        }

        if (!duplicate) {
            uniqueLights.push(light);
            seenPos.push({ x: light.x, y: light.y, z: light.z });
        }
    }

    return uniqueLights;
}

function parsePathSamples(map, center) {
    const getVal = (key) => {
        const feat = map.get(key);
        if (!feat) return [];
        return feat.floatList?.valueList || feat.int64List?.valueList || [];
    };

    const rawXyz = getVal('path_samples/xyz');
    const ids = getVal('path_samples/id');

    if (!rawXyz.length || !ids.length) return null;

    const [cx, cy, cz] = center;

    const vertices = [];

    let prevId = null;
    let px = 0, py = 0, pz = 0;

    for (let i = 0; i < ids.length; i++) {
        const id = ids[i];
        const x = rawXyz[i*3] - cx;
        const y = rawXyz[i*3+1] - cy;
        const z = rawXyz[i*3+2] - cz;

        if (id === prevId) {
            vertices.push(px, py, pz);
            vertices.push(x, y, z);
        }

        prevId = id;
        px = x; py = y; pz = z;
    }

    if (vertices.length === 0) return null;

    return new Float32Array(vertices);
}

function parseSdcState(map, center) {
    const getVal = (key) => {
        const feat = map.get(key);
        return feat?.floatList?.valueList || feat?.int64List?.valueList || [];
    };

    const sdcList = getVal('state/is_sdc');
    let sdcIndex = -1;
    for(let i=0; i<sdcList.length; i++) {
        if(sdcList[i] == 1) {
            sdcIndex = i;
            break;
        }
    }

    if (sdcIndex === -1) return null;

    const count = sdcList.length;

    const pastX = getVal('state/past/x');
    const pastY = getVal('state/past/y');
    const pastZ = getVal('state/past/z');
    const pastVx = getVal('state/past/velocity_x');
    const pastVy = getVal('state/past/velocity_y');

    const currX = getVal('state/current/x');
    const currY = getVal('state/current/y');
    const currZ = getVal('state/current/z');
    const currVx = getVal('state/current/velocity_x');
    const currVy = getVal('state/current/velocity_y');
    const heightList = getVal('state/current/height');

    const futureX = getVal('state/future/x');
    const futureY = getVal('state/future/y');
    const futureZ = getVal('state/future/z');
    const futureVx = getVal('state/future/velocity_x');
    const futureVy = getVal('state/future/velocity_y');

    const sdcHeight = heightList[sdcIndex] || 1.6;

    const pastLen = pastX.length / count;
    const futureLen = futureX.length / count;

    const [cx, cy, cz] = center;
    const trajectory = [];

    // Past
    for (let t = 0; t < pastLen; t++) {
         const idx = sdcIndex * pastLen + t;
         const vx = pastVx[idx] || 0;
         const vy = pastVy[idx] || 0;
         trajectory.push({
            x: pastX[idx] - cx,
            y: pastY[idx] - cy,
            z: pastZ[idx] - cz,
            zBox: pastZ[idx] - cz - (sdcHeight / 2),
            speed: Math.sqrt(vx*vx + vy*vy)
         });
    }

    // Current
    if (currX[sdcIndex] !== undefined) {
         const vx = currVx[sdcIndex] || 0;
         const vy = currVy[sdcIndex] || 0;
         trajectory.push({
            x: currX[sdcIndex] - cx,
            y: currY[sdcIndex] - cy,
            z: currZ[sdcIndex] - cz,
            zBox: currZ[sdcIndex] - cz - (sdcHeight / 2),
            speed: Math.sqrt(vx*vx + vy*vy)
         });
    }

    // Future
    for (let t = 0; t < futureLen; t++) {
         const idx = sdcIndex * futureLen + t;
         const vx = futureVx[idx] || 0;
         const vy = futureVy[idx] || 0;
         trajectory.push({
            x: futureX[idx] - cx,
            y: futureY[idx] - cy,
            z: futureZ[idx] - cz,
            zBox: futureZ[idx] - cz - (sdcHeight / 2),
            speed: Math.sqrt(vx*vx + vy*vy)
         });
    }

    return { trajectory, height: sdcHeight };
}
