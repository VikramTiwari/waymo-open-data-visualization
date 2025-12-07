const express = require('express');
const cors = require('cors');
const path = require('path');
const { TFRecordsStreamReader } = require('./read_data_stream');

const fs = require('fs');
const app = express();
const PORT = 3000;

app.use(cors());

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

        res.json({ 
            done: false, 
            record: result.value,
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

// Cleanup on exit
process.on('SIGINT', async () => {
    if (reader) await reader.close();
    process.exit();
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
