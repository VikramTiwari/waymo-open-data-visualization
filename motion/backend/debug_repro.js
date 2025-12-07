const { TFRecordsStreamReader } = require('./read_data_stream');
const path = require('path');
const fs = require('fs');

async function test() {
    const DATA_DIR = path.join(__dirname, 'data');
    try {
        const files = await fs.promises.readdir(DATA_DIR);
        const tfFile = files.find(f => f.endsWith('.tfrecord') || f.includes('.tfrecord-'));
        
        if (!tfFile) {
            console.error('No TFRecord file found to test.');
            return;
        }

        const fullPath = path.join(DATA_DIR, tfFile);
        console.log(`Testing file: ${fullPath}`);
        
        const reader = new TFRecordsStreamReader(fullPath);
        console.log('Indexing...');
        const offsets = await reader.indexRecords();
        console.log(`Success! Found ${offsets.length} records.`);
        console.log('Sample offsets:', offsets.slice(0, 5));
        
    } catch (e) {
        console.error('FAILED:', e);
    }
}

test();
