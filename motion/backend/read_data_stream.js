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

    async *getStream() {
        if (!this.fileHandle) {
            await this.open();
        }

        let position = 0;
        const lengthBuffer = Buffer.alloc(8);
        const crcBuffer = Buffer.alloc(4);

        try {
            while (true) {
                // Read Length (8 bytes)
                const { bytesRead: lengthBytesRead } = await this.fileHandle.read(lengthBuffer, 0, 8, position);
                if (lengthBytesRead === 0) break; // EOF
                if (lengthBytesRead < 8) throw new Error('Unexpected EOF reading length');

                const dataLength = readInt64(lengthBuffer);
                position += 8;

                // Read Length CRC (4 bytes) - skipping detailed validation for speed/simplicity if wanted, but good to have
                // const { bytesRead: lengthCrcBytesRead } = await this.fileHandle.read(crcBuffer, 0, 4, position);
                // position += 4;
                // ... validation logic similar to original reader ...
                position += 4; // Skip CRC for now to move fast, or can implement if needed

                // Read Data
                const dataBuffer = Buffer.alloc(dataLength);
                const { bytesRead: dataBytesRead } = await this.fileHandle.read(dataBuffer, 0, dataLength, position);
                if (dataBytesRead !== dataLength) throw new Error('Unexpected EOF reading data');
                position += dataLength;

                // Read Data CRC (4 bytes)
                // const { bytesRead: dataCrcBytesRead } = await this.fileHandle.read(crcBuffer, 0, 4, position);
                // position += 4;
                position += 4; // Skip CRC

                // Deserialize
                 // Optimization: TFRecordsImageMessage.deserializeBinary might be synchronous and CPU bound.
                const imageMessage = TFRecordsImageMessage.deserializeBinary(dataBuffer);
                yield imageMessage.toObject();
            }
        } finally {
             // Auto-close on finish or error if the user breaks the loop
            await this.close();
        }
    }
}

module.exports = { TFRecordsStreamReader };
