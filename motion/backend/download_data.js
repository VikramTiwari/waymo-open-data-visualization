const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

async function downloadFiles() {
  // Usage: node download_data.js [bucketName] [prefix]
  // Defaulting to a placeholder or common open dataset bucket if not provided
  // Note: Waymo Open Dataset requires access rights and usually specific buckets.
  
  const bucketName = process.argv[2] || 'waymo_open_dataset_v_1_2_0_individual_files';
  const prefix = process.argv[3] || 'training/';
  const destinationFolder = path.join(__dirname, 'data');

  // Creates a client
  const storage = new Storage();

  if (!fs.existsSync(destinationFolder)){
      fs.mkdirSync(destinationFolder);
  }

  console.log(`Downloading from bucket: ${bucketName}, prefix: ${prefix}`);

  try {
    const [files] = await storage.bucket(bucketName).getFiles({ prefix });

    console.log(`Found ${files.length} files.`);

    for (const file of files) {
        const fileName = path.basename(file.name);
        if (!fileName) continue; // skip directories

        const destination = path.join(destinationFolder, fileName);
        console.log(`Downloading ${file.name} to ${destination}...`);
        
        await file.download({ destination });
        console.log(`Downloaded ${fileName}`);
    }
  } catch (err) {
      console.error('ERROR:', err);
      console.log('NOTE: Ensure you have authenticated with Google Cloud (e.g. `gcloud auth application-default login`) and have access to the bucket.');
  }
}

downloadFiles();
