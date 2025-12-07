const { Storage } = require('@google-cloud/storage');
const fs = require('fs');
const path = require('path');

async function downloadFiles() {
  const bucketName = 'waymo_open_dataset_v_1_2_0_individual_files';
  const prefix = 'training/';
  const destinationFolder = path.join(__dirname, 'data');
  const filesToDownloadCount = 5;

  console.log(`Scanning bucket ${bucketName} for ${filesToDownloadCount} new files...`);

  const storage = new Storage();

  if (!fs.existsSync(destinationFolder)){
      fs.mkdirSync(destinationFolder);
  }

  try {
    // Get a batch of files (more than we need to ensure we find new ones)
    const [files] = await storage.bucket(bucketName).getFiles({ prefix, maxResults: 50 });

    let downloadedCount = 0;

    for (const file of files) {
        if (downloadedCount >= filesToDownloadCount) break;

        const fileName = path.basename(file.name);
        if (!fileName) continue;

        const destination = path.join(destinationFolder, fileName);
        
        if (fs.existsSync(destination)) {
            console.log(`  - Exists: ${fileName} (skipping)`);
            continue;
        }

        console.log(`  - MATCH! Downloading [${downloadedCount + 1}/${filesToDownloadCount}]: ${fileName}...`);
        
        await file.download({ destination });
        console.log(`    Downloaded.`);
        
        downloadedCount++;
    }
    
    if (downloadedCount === 0) {
        console.log('No new files found to download in the first batch of 50.');
    } else {
        console.log(`Successfully downloaded ${downloadedCount} new files.`);
    }

  } catch (err) {
      console.error('ERROR:', err);
  }
}

downloadFiles();
