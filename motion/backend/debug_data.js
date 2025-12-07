const fs = require('fs');
const path = require('path');
const { TFRecordsReader } = require('@roboflow/tfrecords/src/tensorFlowReader');

const DATA_FILE = path.join(__dirname, 'data/training_tfexample.tfrecord-00000-of-01000');

const util = require('util');

function loadData() {
    if (!fs.existsSync(DATA_FILE)) {
        console.log('File not found');
        return;
    }
    const buffer = fs.readFileSync(DATA_FILE);
    const reader = new TFRecordsReader(buffer);
    const records = reader.toArray();
    if (records.length > 0) {
        const record = records[0];
        const featureMap = new Map(record.context.featureMap);
        
        const inspectFeature = (key) => {
            const feat = featureMap.get(key);
            if (!feat) {
                console.log(`${key}: not found`);
                return;
            }
            // feat is likely an object with floatList, int64List etc.
            // Let's see what keys it has
            // const valueType = Object.keys(feat)[0]; 
             // valueList might be inside floatList
             console.log(`Key: ${key}`);
             console.log(util.inspect(feat, { depth: null, colors: false }));
             return;
            // const values = feat[valueType].valueList;
            console.log(`${key}: type=${valueType}, length=${values ? values.length : 'undefined'}`);
            if (values && values.length > 0 && values.length < 20) {
               console.log(`Values: ${values}`);
            }
        };

        inspectFeature('state/id');
        inspectFeature('state/current/x');
        inspectFeature('state/past/x');
        inspectFeature('state/future/x');
        inspectFeature('roadgraph_samples/xyz');
        inspectFeature('roadgraph_samples/id');
        
    } else {
        console.log('No records found');
    }
}

loadData();
