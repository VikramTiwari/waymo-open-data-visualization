const fs = require('fs');
const { crc32c, maskCrc, readInt64 } = require('@roboflow/tfrecords/src/tensorFlowHelpers');
const { TFRecordsImageMessage } = require('@roboflow/tfrecords/src/tensorFlowRecordsProtoBuf_pb');

class TFRecordsStreamReader {
    constructor(filePath) {
        this.filePath = filePath;
        this.fileHandle = null;
        this.buffer = Buffer.alloc(1024 * 64); // 64KB read buffer reuse
    }

    async open() {
        this.fileHandle = await fs.promises.open(this.filePath, 'r');
    }

    async close() {
        if (this.fileHandle) {
            await this.fileHandle.close();
            this.fileHandle = null;
        }
    }

    async *getStream(startOffset = 0) {
        if (!this.fileHandle) {
            await this.open();
        }

        let position = startOffset;
        const lengthBuffer = Buffer.alloc(8);

        try {
            while (true) {
                // Read Length (8 bytes)
                const { bytesRead: lengthBytesRead } = await this.fileHandle.read(lengthBuffer, 0, 8, position);
                if (lengthBytesRead === 0) break; // EOF
                if (lengthBytesRead < 8) throw new Error('Unexpected EOF reading length');

                const dataLength = readInt64(lengthBuffer);
                position += 8;

                // Skip Length CRC (4 bytes)
                position += 4;

                // Read Data
                const dataBuffer = Buffer.alloc(dataLength);
                const { bytesRead: dataBytesRead } = await this.fileHandle.read(dataBuffer, 0, dataLength, position);
                if (dataBytesRead !== dataLength) throw new Error('Unexpected EOF reading data');
                position += dataLength;

                // Skip Data CRC (4 bytes)
                position += 4;

                // Deserialize
                const imageMessage = TFRecordsImageMessage.deserializeBinary(dataBuffer);
                yield imageMessage.toObject();
            }
        } finally {
             // Do NOT auto-close here if we plan to reuse the file handle for wrap-around.
             // Rely on explicit close or garbage collection.
             // But for safety, providing a manual close is better.
             // If we rely on this iterator being the only user, we might want to close.
             // But in random access mode, we might restart stream on same file.
        }
    }

    // Returns array of start positions (byte offsets) for each record
    async indexRecords() {
        if (!this.fileHandle) {
            await this.open();
        }

        const offsets = [];
        let position = 0;
        const lengthBuffer = Buffer.alloc(8);

        try {
            while (true) {
                // Read Length (8 bytes)
                const { bytesRead: lengthBytesRead } = await this.fileHandle.read(lengthBuffer, 0, 8, position);
                if (lengthBytesRead === 0) break; // EOF
                if (lengthBytesRead < 8) throw new Error('Unexpected EOF reading length');

                offsets.push(position);

                const dataLength = readInt64(lengthBuffer);
                
                // Move position: 8 (Length) + 4 (Length CRC) + dataLength + 4 (Data CRC)
                position += 8 + 4 + dataLength + 4;
            }
        } catch (error) {
            console.error('Error indexing records:', error);
            throw error;
        }
        
        return offsets;
    }
}

module.exports = { TFRecordsStreamReader };
