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

app.get('/schema', (req, res) => {
    res.json(SCHEMA);
});

async function openCurrentFile() {
    if (currentFileIndex >= files.length) {
        return false; // No more files
    }

    const filename = files[currentFileIndex];
    const fullPath = path.join(DATA_DIR, filename);
    console.log(`Opening file [${currentFileIndex + 1}/${files.length}]: ${filename}`);

    if (reader) {
        await reader.close();
    }
    reader = new TFRecordsStreamReader(fullPath);
    iterator = reader.getStream();
    return true;
}

// Initialize or reset the stream
app.post('/init', async (req, res) => {
    try {
        // 1. Scan directory
        const allFiles = await fs.promises.readdir(DATA_DIR);
        // 2. Filter and sort
        files = allFiles
            .filter(f => f.endsWith('.tfrecord') || f.includes('.tfrecord-'))
            .sort(); // default lexical sort should be fine for 00000, 00001, etc.

        if (files.length === 0) {
            throw new Error('No .tfrecord files found in data directory');
        }

        console.log(`Found ${files.length} data files.`);

        // 3. Reset index and open first
        currentFileIndex = 0;
        await openCurrentFile();

        console.log('Stream initialized');
        res.json({ success: true, message: 'Stream initialized', fileCount: files.length, currentFile: files[0] });
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
        let result = await iterator.next();
        
        // If current file is done, try to move to the next one
        while (result.done) {
            console.log(`Finished file index ${currentFileIndex}`);
            currentFileIndex++;
            const hasMore = await openCurrentFile();
            
            if (!hasMore) {
                console.log('All files processed.');
                return res.json({ done: true });
            }
            
            // Try reading from new file
            result = await iterator.next();
        }

        res.json({ done: false, record: result.value });
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
