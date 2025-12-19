const express = require('express');
const cors = require('cors');
const path = require('path');
const compression = require('compression');
require('dotenv').config(); // Load environment variables

const { TFRecordsStreamReader } = require('./read_data_stream');

const fs = require('fs');
const app = express();
const PORT = process.env.PORT || 5555;

app.use(cors());
app.use(compression());

// Internal state
let files = [];
let currentFileIndex = 0;
const DATA_DIR = path.join(__dirname, 'data');
const SCHEMA = require('./schema.json');

// Global state for reading
let reader = null;
let iterator = null;
let currentTotalScenarios = 0;
let currentScenarioIndex = 0;

// Session state
let recordOffsets = [];
let sessionRemaining = 0;
const SESSION_LIMIT = 50;

app.get('/schema', (req, res) => {
    res.json(SCHEMA);
});

async function startNewSession() {
    // 1. Pick Random File
    if (files.length === 0) return false;
    currentFileIndex = Math.floor(Math.random() * files.length);
    
    const filename = files[currentFileIndex];
    const fullPath = path.join(DATA_DIR, filename);
    
    console.log(`\n================================================================================`);
    console.log(`>>> STARTING NEW SESSION`);
    console.log(`>>> FILE [${currentFileIndex + 1}/${files.length}]: ${filename}`);
    
    if (reader) {
        await reader.close();
    }
    reader = new TFRecordsStreamReader(fullPath);

    // 2. Index Records
    try {
        console.log('Indexing records...');
        recordOffsets = await reader.indexRecords();
        currentTotalScenarios = recordOffsets.length;
        console.log(`Total scenarios: ${currentTotalScenarios}`);
    } catch (e) {
        console.error('Error indexing records:', e);
        return false;
    }

    if (currentTotalScenarios === 0) {
        // Empty file? Try another
        return startNewSession();
    }

    // 3. Pick Random Start
    currentScenarioIndex = Math.floor(Math.random() * currentTotalScenarios); // 0-based index
    console.log(`>>> RANDOM START: Scenario #${currentScenarioIndex + 1} (Offset ${recordOffsets[currentScenarioIndex]})`);
    console.log(`================================================================================\n`);

    // 4. Initialize Stream
    iterator = reader.getStream(recordOffsets[currentScenarioIndex]);
    
    // 5. Reset Session Counter
    sessionRemaining = SESSION_LIMIT;
    
    return true;
}

// Initialize or reset the stream
app.post('/init', async (req, res) => {
    try {
        // 1. Scan directory
        const allFiles = await fs.promises.readdir(DATA_DIR);
        // 2. Filter 
        files = allFiles
            .filter(f => f.endsWith('.tfrecord') || f.includes('.tfrecord-'));

        if (files.length === 0) {
            throw new Error('No .tfrecord files found in data directory');
        }

        console.log(`Found ${files.length} data files.`);

        // 3. Start first session
        await startNewSession();

        console.log('Stream initialized (Random Mode)');
        res.json({ success: true, message: 'Stream initialized', fileCount: files.length });
    } catch (error) {
        console.error('Error initializing stream:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get next record
app.get('/next', async (req, res) => {
    if (!iterator) {
        return res.status(400).json({ error: 'Stream not initialized. Call /init first.' });
    }

    try {
        // Check session limit
        if (sessionRemaining <= 0) {
            console.log('Session limit reached. Switching to new file...');
            await startNewSession();
        }

        let result = await iterator.next();
        
        // Handle EOF (Wrap around for the remainder of the session)
        if (result.done) {
            console.log('EOF reached within session. Wrapping around to start of file...');
            currentScenarioIndex = 0; // Reset index to 0
            iterator = reader.getStream(recordOffsets[0]); // Stream from 0
            result = await iterator.next();
        }

        if (result.done) {
            // If still done after wrap (empty file?), force new session
             await startNewSession();
             result = await iterator.next();
        }

        // Increment logic
        currentScenarioIndex++;
        // If we just played the last one (index became total), next read will trigger EOF logic above, 
        // but for display, we wrap index display if needed logic is complicated.
        // Actually simplest is: `currentScenarioIndex` tracks the one we JUST read? 
        // Logic above: `currentScenarioIndex` was set to start. We read `next()`. So that IS `currentScenarioIndex`.
        // So we should increment AFTER using it? Or 0-based...
        // Let's rely on standard logic: 
        // We set `currentScenarioIndex` to `start`.
        // We read. That record corresponds to `currentScenarioIndex`.
        // Then we increment for next time.
        // BUT if we wrapped, we set `currentScenarioIndex` to 0.
        
        // Let's refine wrap logic slightly to keep index sync:
        // (already done above: set to 0 before getting stream)

        sessionRemaining--;
        // display index is currentScenarioIndex passed in header? 
        // or just local variable.
        // let's just send the index of the record we just returned.
        // If we read `next()`, it matches `currentScenarioIndex` (which is valid).
        // Then we wrap `currentScenarioIndex` for the NEXT call.
        
        const displayIndex = currentScenarioIndex; // 0-based
        if (currentScenarioIndex + 1 >= currentTotalScenarios) {
             // Next one will be 0 (if we continue in this file)
             // But actually EOF logic handles it on next call.
             // We can just mod it here if we want to be safe? 
             // Just let the next call handle EOF.
        }
        
        // Prepare for NEXT call:
        // Wait, if we just read index 197 (last one), next call hits EOF.
        // So we don't increment here if we want to rely on EOF?
        // Actually, if we just read 197, we should say we are at 197.
        // Next time we try to read, we hit EOF, wrap to 0.
        
        console.log(`Streaming Scenario ${displayIndex + 1}/${currentTotalScenarios} (Session Rem: ${sessionRemaining})`);

        // Prune Data before sending
        const prunedRecord = pruneData(result.value);

        res.json({ 
            done: false, 
            record: prunedRecord,
            fileInfo: {
                index: currentFileIndex + 1,
                total: files.length,
                name: files[currentFileIndex]
            },
            scenarioInfo: {
                index: displayIndex + 1,
                total: currentTotalScenarios
            }
        });
        
        // Advance index for next time (unless we hit EOF next time)
        // Ideally we shouldn't manually manage this if stream is opaque, but we have offsets!
        // We know where we are.
        // But simply ++ is enough for visual.
        currentScenarioIndex = (currentScenarioIndex + 1) % currentTotalScenarios; 
        
    } catch (error) {
        console.error('Error reading next record:', error);
        res.status(500).json({ error: error.message });
    }
});

// Whitelist of features we actually use in Frontend
const FEATURE_WHITELIST = new Set([
    'scenario/id',
    // RoadGraph
    'roadgraph_samples/xyz', 'roadgraph_samples/id', 'roadgraph_samples/type', 'roadgraph_samples/valid', 'roadgraph_samples/dir',
    // Traffic Lights
    'traffic_light_state/current/id', 'traffic_light_state/current/state', 'traffic_light_state/current/x', 'traffic_light_state/current/y', 'traffic_light_state/current/z', 'traffic_light_state/current/valid',
    'traffic_light_state/past/state', 'traffic_light_state/past/x', 'traffic_light_state/past/y', 'traffic_light_state/past/z', 'traffic_light_state/past/valid',
    'traffic_light_state/future/state', 'traffic_light_state/future/x', 'traffic_light_state/future/y', 'traffic_light_state/future/z', 'traffic_light_state/future/valid',
    // Agents / State
    'state/id', 'state/type', 'state/is_sdc',
    'state/current/x', 'state/current/y', 'state/current/z', 'state/current/bbox_yaw', 'state/current/velocity_x', 'state/current/velocity_y',
    'state/current/length', 'state/current/width', 'state/current/height', 'state/current/valid',
    'state/past/x', 'state/past/y', 'state/past/z', 'state/past/bbox_yaw', 'state/past/velocity_x', 'state/past/velocity_y', 'state/past/valid',
    'state/future/x', 'state/future/y', 'state/future/z', 'state/future/bbox_yaw', 'state/future/velocity_x', 'state/future/velocity_y', 'state/future/valid',
    // Path Samples (if used) - currently referenced in PathSamples.jsx
    'path_samples/xyz', 'path_samples/id', 'path_samples/valid'
]);

// Convert Set to Array for iteration
const FEATURE_WHITELIST_ARRAY = Array.from(FEATURE_WHITELIST);

function pruneData(record) {
    if (!record || !record.context || !record.context.featureMap) return record;

    const originalMap = record.context.featureMap;
    const prunedMap = {};
    let foundAny = false;

    // Detect Input Type and Iterate
    if (Array.isArray(originalMap)) {
        // Optimized loop with early exit if we found all features (heuristic: count > size?)
        // Actually, we don't know how many unique features are in originalMap that match whitelist.
        // But we can iterate.
        const len = originalMap.length;
        for (let i = 0; i < len; i++) {
            const entry = originalMap[i];
            let k, v;
            if (Array.isArray(entry)) {
                 k = entry[0]; v = entry[1];
            } else if (entry && typeof entry === 'object') {
                 // MapEntry usually has 'key' and 'value' fields
                 k = entry.key;
                 v = entry.value;
            }
            
            if (k && FEATURE_WHITELIST.has(k)) {
                prunedMap[k] = v;
                foundAny = true;
            }
        }
    } else if (originalMap instanceof Map) {
        for (let [k, v] of originalMap) {
            if (FEATURE_WHITELIST.has(k)) {
                prunedMap[k] = v;
                foundAny = true;
            }
        }
    } else {
        // Plain Object - Optimized Iteration
        // Instead of Object.keys(originalMap) which is O(N) where N is all keys,
        // we iterate the whitelist O(M) where M is whitelist size.
        // Assuming N >> M.
        for (let i = 0; i < FEATURE_WHITELIST_ARRAY.length; i++) {
             const k = FEATURE_WHITELIST_ARRAY[i];
             // We use Object.prototype.hasOwnProperty because originalMap might be created with null prototype or have shadowed props
             if (Object.prototype.hasOwnProperty.call(originalMap, k)) {
                 prunedMap[k] = originalMap[k];
                 foundAny = true;
             }
        }
    }

    if (!foundAny) {
        // Only warn if map was not empty but we found nothing
        const len = Array.isArray(originalMap) ? originalMap.length : (originalMap instanceof Map ? originalMap.size : Object.keys(originalMap).length);
        if (len > 0) {
             console.warn('Prune: WARNING - No keys matched whitelist! (Input len: ' + len + ')');
        }
    }

    return {
        ...record,
        context: {
            ...record.context,
            featureMap: prunedMap
        }
    };
}


// Cleanup on exit
process.on('SIGINT', async () => {
    if (reader) await reader.close();
    process.exit();
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
