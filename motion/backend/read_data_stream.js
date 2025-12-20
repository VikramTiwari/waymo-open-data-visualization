const fs = require('fs');
const { readInt64 } = require('@roboflow/tfrecords/src/tensorFlowHelpers');
const { TFRecordsImageMessage } = require('@roboflow/tfrecords/src/tensorFlowRecordsProtoBuf_pb');

class TFRecordsStreamReader {
    constructor(filePath) {
        this.filePath = filePath;
        this.fileHandle = null;
        this.bufferSize = 128 * 1024; // 128KB buffer
        this.buffer = Buffer.allocUnsafe(this.bufferSize);
        this.bufferStart = 0; // File offset where the buffer starts
        this.bufferEnd = 0;   // File offset where the buffer ends (exclusive)
        this.fileSize = 0;
    }

    async open() {
        this.fileHandle = await fs.promises.open(this.filePath, 'r');
        const stats = await this.fileHandle.stat();
        this.fileSize = stats.size;
    }

    async close() {
        if (this.fileHandle) {
            await this.fileHandle.close();
            this.fileHandle = null;
        }
    }

    // Ensures we have at least `size` bytes in buffer starting from `offset`.
    // `offset` is absolute file position.
    // Returns a slice of the buffer.
    async readBytes(offset, size) {
        // If request spans beyond current buffer
        if (offset < this.bufferStart || offset + size > this.bufferEnd) {
            // If requested size is larger than buffer, just read directly (alloc new buffer)
            if (size > this.bufferSize) {
                const bigBuf = Buffer.allocUnsafe(size);
                await this.fileHandle.read(bigBuf, 0, size, offset);
                return bigBuf;
            }

            // Otherwise, refill buffer centered or starting at offset
            // Ideally start at offset
            this.bufferStart = offset;
            const bytesToRead = Math.min(this.bufferSize, this.fileSize - this.bufferStart);
            const { bytesRead } = await this.fileHandle.read(this.buffer, 0, bytesToRead, this.bufferStart);
            this.bufferEnd = this.bufferStart + bytesRead;

            if (bytesRead < size) {
                throw new Error(`Unexpected EOF: Wanted ${size} bytes, got ${bytesRead}`);
            }
        }

        const localStart = offset - this.bufferStart;
        const localEnd = localStart + size;
        return this.buffer.subarray(localStart, localEnd);
    }

    async *getStream(startOffset = 0) {
        if (!this.fileHandle) {
            await this.open();
        }

        let position = startOffset;

        try {
            while (position < this.fileSize) {
                // Read Length (8 bytes)
                // We might be at EOF if position == fileSize
                if (position + 8 > this.fileSize) break;

                const lengthBuf = await this.readBytes(position, 8);
                const dataLength = readInt64(lengthBuf);
                position += 8;

                // Skip Length CRC (4 bytes)
                position += 4;

                // Read Data
                const dataBuf = await this.readBytes(position, dataLength);
                position += dataLength;

                // Skip Data CRC (4 bytes)
                position += 4;

                // Deserialize
                const imageMessage = TFRecordsImageMessage.deserializeBinary(dataBuf);
                yield imageMessage.toObject();
            }
        } finally {
             // Do NOT auto-close here if we plan to reuse the file handle for wrap-around.
        }
    }

    // Returns array of start positions (byte offsets) for each record
    async indexRecords() {
        if (!this.fileHandle) {
            await this.open();
        }

        const offsets = [];
        let position = 0;

        try {
            while (position < this.fileSize) {
                if (position + 8 > this.fileSize) break;

                // Read Length (8 bytes)
                const lengthBuf = await this.readBytes(position, 8);

                offsets.push(position);

                const dataLength = readInt64(lengthBuf);
                
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
