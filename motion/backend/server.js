const express = require('express');
const cors = require('cors');
const path = require('path');
const { TFRecordsStreamReader } = require('./read_data_stream');

const app = express();
const PORT = 3000;

app.use(cors());

// Path to the dataset
const DATA_FILE = path.join(__dirname, 'data/training_tfexample.tfrecord-00000-of-01000');
const SCHEMA = require('./schema.json');

// Global state for reading
let reader = null;
let iterator = null;

app.get('/schema', (req, res) => {
    res.json(SCHEMA);
});

// Initialize or reset the stream
app.post('/init', async (req, res) => {
    try {
        if (reader) {
            await reader.close();
        }
        reader = new TFRecordsStreamReader(DATA_FILE);
        iterator = reader.getStream();
        console.log('Stream initialized');
        res.json({ success: true, message: 'Stream initialized' });
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
        const { value, done } = await iterator.next();
        
        if (done) {
            console.log('End of stream reached');
            // Optionally close here or let /init handle re-opening
            return res.json({ done: true });
        }

        res.json({ done: false, record: value });
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
