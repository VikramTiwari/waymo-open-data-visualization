// Generic Parsing Utilities for Waymo Data

// Helper to find SDC index once
const getSdcIndex = (sdcList) => {
    if (!sdcList) return -1;
    let idx = sdcList.indexOf(Number(1));
    if (idx === -1) idx = sdcList.findIndex((v) => v == 1);
    return idx;
};

// Helper to safely get values
const getFeatVal = (parsedMap, key) => {
    const feat = parsedMap.get(key);
    if (!feat) return [];
    return feat.floatList?.valueList || feat.int64List?.valueList || [];
};

export const parseMap = (data) => {
    if (!data) return null;
    const featureMap = data?.context?.featureMap;
    // Robust map creation
    let map;
    if (Array.isArray(featureMap)) {
      if (featureMap.length > 0 && Array.isArray(featureMap[0])) {
        map = new Map(featureMap);
      } else if (featureMap.length > 0 && typeof featureMap[0] === "object") {
        map = new Map(featureMap.map((e) => [e.key, e.value]));
      } else {
        map = new Map();
      }
    } else {
      map = new Map(Object.entries(featureMap || {}));
    }
    return map;
  };

export const calculateCenter = (parsedMap) => {
    if (!parsedMap) return [0, 0, 0];

    const sdcList = getFeatVal(parsedMap, "state/is_sdc");
    const xList = getFeatVal(parsedMap, "state/current/x");
    const yList = getFeatVal(parsedMap, "state/current/y");
    const zList = getFeatVal(parsedMap, "state/current/z");

    if (!xList.length || !yList.length) return [0, 0, 0];

    // Find index of SDC
    let sdcIndex = getSdcIndex(sdcList);
    // Fallback to first agent
    if (sdcIndex === -1) sdcIndex = 0;

    return [xList[sdcIndex] || 0, yList[sdcIndex] || 0, zList[sdcIndex] || 0];
};

export const parseScenarioId = (parsedMap) => {
    if (!parsedMap) return null;
    const idVal = parsedMap.get("scenario/id")?.bytesList?.valueList?.[0];
    if (!idVal) return "Unknown";
    return String(idVal);
};

export const calculateSdcSpeeds = (parsedMap) => {
    if (!parsedMap) return [];

    const sdcList = getFeatVal(parsedMap, "state/is_sdc");
    const sdcIndex = getSdcIndex(sdcList);
    if (sdcIndex === -1) return [];

    // Past
    const pastVx = getFeatVal(parsedMap, "state/past/velocity_x");
    const pastVy = getFeatVal(parsedMap, "state/past/velocity_y");

    // Current
    const currVx = getFeatVal(parsedMap, "state/current/velocity_x");
    const currVy = getFeatVal(parsedMap, "state/current/velocity_y");

    // Future
    const futureVx = getFeatVal(parsedMap, "state/future/velocity_x");
    const futureVy = getFeatVal(parsedMap, "state/future/velocity_y");

    const count = sdcList.length;

    // Derived lengths
    const pastLen = pastVx.length / count;
    const futureLen = futureVx.length / count;

    const speeds = [];

    // Past
    for (let t = 0; t < pastLen; t++) {
      const idx = sdcIndex * pastLen + t;
      const vx = pastVx[idx] || 0;
      const vy = pastVy[idx] || 0;
      speeds.push(Math.sqrt(vx * vx + vy * vy));
    }
    // Current
    {
      const vx = currVx[sdcIndex] || 0;
      const vy = currVy[sdcIndex] || 0;
      speeds.push(Math.sqrt(vx * vx + vy * vy));
    }
    // Future
    for (let t = 0; t < futureLen; t++) {
      const idx = sdcIndex * futureLen + t;
      const vx = futureVx[idx] || 0;
      const vy = futureVy[idx] || 0;
      speeds.push(Math.sqrt(vx * vx + vy * vy));
    }

    return speeds;
};

export const parseAgents = (parsedMap, center) => {
    if (!parsedMap) return [];

    const ids = getFeatVal(parsedMap, "state/id");
    const count = ids.length;
    if (count === 0) return [];

    const pastX = getFeatVal(parsedMap, "state/past/x");
    const pastY = getFeatVal(parsedMap, "state/past/y");
    const pastZ = getFeatVal(parsedMap, "state/past/z");
    const pastYaw = getFeatVal(parsedMap, "state/past/bbox_yaw");
    const pastVx = getFeatVal(parsedMap, "state/past/velocity_x");
    const pastVy = getFeatVal(parsedMap, "state/past/velocity_y");

    // Check lengths safely
    const pastLen = pastX.length > 0 ? pastX.length / count : 0;

    const currX = getFeatVal(parsedMap, "state/current/x");
    const currY = getFeatVal(parsedMap, "state/current/y");
    const currZ = getFeatVal(parsedMap, "state/current/z");
    const currYaw = getFeatVal(parsedMap, "state/current/bbox_yaw");
    const currVx = getFeatVal(parsedMap, "state/current/velocity_x");
    const currVy = getFeatVal(parsedMap, "state/current/velocity_y");

    const futureX = getFeatVal(parsedMap, "state/future/x");
    const futureY = getFeatVal(parsedMap, "state/future/y");
    const futureZ = getFeatVal(parsedMap, "state/future/z");
    const futureYaw = getFeatVal(parsedMap, "state/future/bbox_yaw");
    const futureVx = getFeatVal(parsedMap, "state/future/velocity_x");
    const futureVy = getFeatVal(parsedMap, "state/future/velocity_y");
    const futureLen = futureX.length > 0 ? futureX.length / count : 0;

    const width = getFeatVal(parsedMap, "state/current/width");
    const length = getFeatVal(parsedMap, "state/current/length");
    const height = getFeatVal(parsedMap, "state/current/height");
    const type = getFeatVal(parsedMap, "state/type");
    const isSdcList = getFeatVal(parsedMap, "state/is_sdc");

    const [cx, cy, cz] = center;

    // Optimization: Spatial Grid for Parked Detection
    // Only build if we have agents that might be parked (Type 1: Vehicle)
    let hasVehicles = false;
    for(let i=0; i<count; i++) {
        if(type[i] === 1) {
            hasVehicles = true;
            break;
        }
    }

    let spatialGrid = null;
    const GRID_SIZE = 10; // 10m grid cells

    if (hasVehicles) {
        const mapX = getFeatVal(parsedMap, "roadgraph_samples/xyz");
        const mapType = getFeatVal(parsedMap, "roadgraph_samples/type");

        if (mapX && mapType) {
             spatialGrid = new Map();
             const getKey = (x, y) => {
                 const gx = Math.floor(x / GRID_SIZE);
                 const gy = Math.floor(y / GRID_SIZE);
                 return `${gx},${gy}`;
             };

             // Populate grid with lane points
             for (let i = 0; i < mapType.length; i++) {
                if (mapType[i] === 1 || mapType[i] === 2) {
                    const x = mapX[i * 3] - cx;
                    const y = mapX[i * 3 + 1] - cy;
                    // z not needed for parked check 2d
                    const key = getKey(x, y);
                    if (!spatialGrid.has(key)) spatialGrid.set(key, []);
                    spatialGrid.get(key).push({x, y});
                }
             }
        }
    }

    const agents = [];
    for (let i = 0; i < count; i++) {
      const trajectory = [];

      // Helper to avoid allocating object if not needed, but we need it for trajectory array
      // Replaced pushStep with inline logic to avoid closure creation overhead in loop
      // Past
      for (let t = 0; t < pastLen; t++) {
        const idx = i * pastLen + t;
        const vx = pastVx[idx] || 0;
        const vy = pastVy[idx] || 0;
        trajectory.push({
          x: pastX[idx] - cx,
          y: pastY[idx] - cy,
          z: pastZ[idx] - cz,
          yaw: pastYaw[idx] || 0,
          vx: vx,
          vy: vy,
          speed: Math.sqrt(vx * vx + vy * vy),
        });
      }

      // Current
      {
          const vx = currVx[i] || 0;
          const vy = currVy[i] || 0;
          trajectory.push({
            x: currX[i] - cx,
            y: currY[i] - cy,
            z: currZ[i] - cz,
            yaw: currYaw[i] || 0,
            vx: vx,
            vy: vy,
            speed: Math.sqrt(vx * vx + vy * vy),
          });
      }

      // Future
      for (let t = 0; t < futureLen; t++) {
        const idx = i * futureLen + t;
        const vx = futureVx[idx] || 0;
        const vy = futureVy[idx] || 0;
        trajectory.push({
          x: futureX[idx] - cx,
          y: futureY[idx] - cy,
          z: futureZ[idx] - cz,
          yaw: futureYaw[idx] || 0,
          vx: vx,
          vy: vy,
          speed: Math.sqrt(vx * vx + vy * vy),
        });
      }

      // Accel calc
      for (let t = 0; t < trajectory.length - 1; t++) {
        const step = trajectory[t];
        const next = trajectory[t + 1];
        // Reuse speed if possible, already calc'd
        // But accel needs to be added to 'step'
        const accel = (next.speed - step.speed) / 0.1;
        step.accel = accel;
      }

      let maxSpeed = 0;
      for (let t = 0; t < trajectory.length; t++) {
          if (trajectory[t].speed > maxSpeed) maxSpeed = trajectory[t].speed;
      }

      let isParked = false;
      // Optimize Parked Check
      if (type[i] === 1 && maxSpeed < 0.5 && spatialGrid) {
        const startPos = trajectory[0];
        const gx = Math.floor(startPos.x / GRID_SIZE);
        const gy = Math.floor(startPos.y / GRID_SIZE);

        // Check 3x3 grid cells around
        let found = false;
        let minDistSq = Infinity;
        const checkCell = (x, y) => {
             const key = `${x},${y}`;
             const cell = spatialGrid.get(key);
             if (cell) {
                 for(let k=0; k<cell.length; k++) {
                     const lp = cell[k];
                     const dx = lp.x - startPos.x;
                     const dy = lp.y - startPos.y;
                     const d = dx*dx + dy*dy;
                     if (d < minDistSq) minDistSq = d;
                     if (d < 4.0) return true; // Found close lane point
                 }
             }
             return false;
        };

        // Check center and neighbors
        for(let ox=-1; ox<=1; ox++) {
            for(let oy=-1; oy<=1; oy++) {
                if(checkCell(gx+ox, gy+oy)) {
                    found = true;
                    break;
                }
            }
            if(found) break;
        }

        if (!found) isParked = true; // No lane point within 2m (4.0 sq)
      }

      const isSdc = isSdcList && isSdcList[i] == 1;

      agents.push({
        id: ids[i],
        type: type[i],
        isSdc: isSdc,
        isParked: isParked,
        dims: [length[i], width[i], height[i] || 1.5],
        trajectory,
      });
    }
    return agents;
};

export const parseTrafficLights = (parsedMap, center) => {
    if (!parsedMap) return [];

    const ids = getFeatVal(parsedMap, "traffic_light_state/current/id");
    const count = ids.length;
    if (count === 0) return [];

    const currentStates = getFeatVal(parsedMap, "traffic_light_state/current/state");
    const currentX = getFeatVal(parsedMap, "traffic_light_state/current/x");
    const currentY = getFeatVal(parsedMap, "traffic_light_state/current/y");
    const currentZ = getFeatVal(parsedMap, "traffic_light_state/current/z");
    const currentValid = getFeatVal(parsedMap, "traffic_light_state/current/valid");

    const pastStates = getFeatVal(parsedMap, "traffic_light_state/past/state");
    const pastValid = getFeatVal(parsedMap, "traffic_light_state/past/valid");

    const futureStates = getFeatVal(parsedMap, "traffic_light_state/future/state");
    const futureValid = getFeatVal(parsedMap, "traffic_light_state/future/valid");

    const pastLen = pastStates.length > 0 ? pastStates.length / count : 0;
    const futureLen = futureStates.length > 0 ? futureStates.length / count : 0;

    const [cx, cy, cz] = center;

    // RoadGraph samples for orientation
    const mapIds = getFeatVal(parsedMap, "roadgraph_samples/id");
    const mapDir = getFeatVal(parsedMap, "roadgraph_samples/dir");
    const mapX = getFeatVal(parsedMap, "roadgraph_samples/xyz");

    // Build efficient lookup for map samples
    const samplesById = new Map();
    if (mapIds && mapDir && mapX) {
      for (let i = 0; i < mapIds.length; i++) {
        const id = mapIds[i];
        if (!samplesById.has(id)) {
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
      if (sIndices && sIndices.length > 0) {
        let minDist = Infinity;
        let bestIdx = -1;
        // Optimization: Pre-check if indices count is huge.
        // Usually it's small per segment. If large, could optimize, but map lookup reduced space significantly.
        for (const idx of sIndices) {
          const mx = mapX[idx * 3] - cx;
          const my = mapX[idx * 3 + 1] - cy;
          // z check might be important if multiple levels
          const mz = mapX[idx * 3 + 2] - cz;

          const d = (mx - x) * (mx - x) + (my - y) * (my - y) + (mz - z) * (mz - z);
          if (d < minDist) {
            minDist = d;
            bestIdx = idx;
          }
        }

        if (bestIdx !== -1) {
          const dx = mapDir[bestIdx * 3];
          const dy = mapDir[bestIdx * 3 + 1];
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
        state: currentStates[i],
      });

      // Future
      for (let t = 0; t < futureLen; t++) {
        const idx = i * futureLen + t;
        if (futureValid && futureValid[idx] === 0) {
          trajectory.push(null);
          continue;
        }
        trajectory.push({
          state: futureStates[idx],
        });
      }

      parsedLights.push({
        id: ids[i],
        x,
        y,
        z,
        yaw,
        trajectory,
      });
    }

    // Dedup / Cluster
    // Use spatial hash for dedup instead of O(N^2)
    const uniqueLights = [];
    const dedupGrid = new Map(); // key "x_y_z" rounded

    for (const light of parsedLights) {
       // Round to 0.2m precision for key
       const kx = Math.round(light.x * 5);
       const ky = Math.round(light.y * 5);
       const kz = Math.round(light.z * 5);
       const key = `${kx},${ky},${kz}`;

       if(!dedupGrid.has(key)) {
           dedupGrid.set(key, true);
           uniqueLights.push(light);
       }
    }

    return uniqueLights;
};

export const parsePathSamples = (parsedMap, center) => {
    if (!parsedMap) return null;

    const rawXyz = getFeatVal(parsedMap, "path_samples/xyz");
    const ids = getFeatVal(parsedMap, "path_samples/id");

    if (!rawXyz.length || !ids.length) return null;

    const [cx, cy, cz] = center;
    const vertices = [];

    let prevId = null;
    let px = 0, py = 0, pz = 0;

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const x = rawXyz[i * 3] - cx;
      const y = rawXyz[i * 3 + 1] - cy;
      const z = rawXyz[i * 3 + 2] - cz;

      if (id === prevId) {
        vertices.push(px, py, pz);
        vertices.push(x, y, z);
      }

      prevId = id;
      px = x;
      py = y;
      pz = z;
    }

    if (vertices.length === 0) return null;

    return new Float32Array(vertices);
};

export const parseSdcState = (parsedMap, center) => {
    if (!parsedMap) return null;

    const sdcList = getFeatVal(parsedMap, "state/is_sdc");
    const sdcIndex = getSdcIndex(sdcList);
    if (sdcIndex === -1) return null;

    const count = sdcList.length;

    const pastX = getFeatVal(parsedMap, "state/past/x");
    const pastY = getFeatVal(parsedMap, "state/past/y");
    const pastZ = getFeatVal(parsedMap, "state/past/z");
    const pastVx = getFeatVal(parsedMap, "state/past/velocity_x");
    const pastVy = getFeatVal(parsedMap, "state/past/velocity_y");

    const currX = getFeatVal(parsedMap, "state/current/x");
    const currY = getFeatVal(parsedMap, "state/current/y");
    const currZ = getFeatVal(parsedMap, "state/current/z");
    const currVx = getFeatVal(parsedMap, "state/current/velocity_x");
    const currVy = getFeatVal(parsedMap, "state/current/velocity_y");
    const heightList = getFeatVal(parsedMap, "state/current/height");

    const futureX = getFeatVal(parsedMap, "state/future/x");
    const futureY = getFeatVal(parsedMap, "state/future/y");
    const futureZ = getFeatVal(parsedMap, "state/future/z");
    const futureVx = getFeatVal(parsedMap, "state/future/velocity_x");
    const futureVy = getFeatVal(parsedMap, "state/future/velocity_y");

    const sdcHeight = heightList[sdcIndex] || 1.6;

    const pastLen = pastX.length > 0 ? pastX.length / count : 0;
    const futureLen = futureX.length > 0 ? futureX.length / count : 0;

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
        zBox: pastZ[idx] - cz - sdcHeight / 2,
        speed: Math.sqrt(vx * vx + vy * vy),
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
        zBox: currZ[sdcIndex] - cz - sdcHeight / 2,
        speed: Math.sqrt(vx * vx + vy * vy),
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
        zBox: futureZ[idx] - cz - sdcHeight / 2,
        speed: Math.sqrt(vx * vx + vy * vy),
      });
    }

    return { trajectory, height: sdcHeight };
};
