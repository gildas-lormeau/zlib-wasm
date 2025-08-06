#!/usr/bin/env deno run --allow-read --allow-net

import { DecompressionStream } from "../src/index.js";

// Test utilities
const TestUtils = {
    test: async (name, testFn) => {
        try {
            console.log(`\nTest: ${name}`);
            await testFn();
            console.log(`✓ PASSED: ${name}`);
        } catch (error) {
            console.error(`❌ FAILED: ${name}`);
            console.error(`   Error: ${error.message}`);
            throw error;
        }
    },
    assert: (condition, message) => {
        if (!condition) {
            throw new Error(message || "Assertion failed");
        }
    }
};

// ZIP file parsing utilities
function parseZipFile(zipData) {
    const view = new DataView(zipData.buffer);
    const files = [];

    // Find central directory
    let centralDirOffset = -1;
    for (let i = zipData.length - 22; i >= 0; i--) {
        if (view.getUint32(i, true) === 0x06054b50) { // End of central directory signature
            centralDirOffset = view.getUint32(i + 16, true);
            break;
        }
    }

    if (centralDirOffset === -1) {
        throw new Error("Invalid ZIP file: Central directory not found");
    }

    // Parse central directory entries
    let offset = centralDirOffset;
    while (offset < zipData.length - 22) {
        const signature = view.getUint32(offset, true);
        if (signature !== 0x02014b50) break; // Central directory file header signature

        const compressionMethod = view.getUint16(offset + 10, true);
        const compressedSize = view.getUint32(offset + 20, true);
        const uncompressedSize = view.getUint32(offset + 24, true);
        const filenameLength = view.getUint16(offset + 28, true);
        const extraFieldLength = view.getUint16(offset + 30, true);
        const commentLength = view.getUint16(offset + 32, true);
        const localHeaderOffset = view.getUint32(offset + 42, true);

        const filename = new TextDecoder().decode(
            zipData.slice(offset + 46, offset + 46 + filenameLength)
        );

        files.push({
            filename,
            compressionMethod,
            compressedSize,
            uncompressedSize,
            localHeaderOffset
        });

        offset += 46 + filenameLength + extraFieldLength + commentLength;
    }

    return files;
}

function extractFileData(zipData, fileEntry) {
    const view = new DataView(zipData.buffer);
    const localHeaderOffset = fileEntry.localHeaderOffset;

    // Verify local file header signature
    const signature = view.getUint32(localHeaderOffset, true);
    if (signature !== 0x04034b50) {
        throw new Error("Invalid local file header signature");
    }

    const filenameLength = view.getUint16(localHeaderOffset + 26, true);
    const extraFieldLength = view.getUint16(localHeaderOffset + 28, true);

    const dataOffset = localHeaderOffset + 30 + filenameLength + extraFieldLength;
    return zipData.slice(dataOffset, dataOffset + fileEntry.compressedSize);
}

console.log("Deflate64 ZIP File Tests");

let testCount = 0;
let passedCount = 0;

await TestUtils.test("Read and parse deflate64 ZIP file", async () => {
    testCount++;

    const zipResponse = await fetch(new URL("./data/lorem-deflate64.zip", import.meta.url));
    const zipData = new Uint8Array(await zipResponse.arrayBuffer());
    TestUtils.assert(zipData.length > 0, "ZIP file should not be empty");
    console.log(`   ZIP file size: ${zipData.length} bytes`);

    const files = parseZipFile(zipData);
    TestUtils.assert(files.length > 0, "ZIP should contain at least one file");
    console.log(`   Found ${files.length} file(s) in ZIP`);

    for (const file of files) {
        console.log(`   File: ${file.filename}`);
        console.log(`   Compression method: ${file.compressionMethod} ${file.compressionMethod === 9 ? "(deflate64)" : ""}`);
        console.log(`   Compressed size: ${file.compressedSize} bytes`);
        console.log(`   Uncompressed size: ${file.uncompressedSize} bytes`);

        if (file.compressionMethod === 9) { // Deflate64
            console.log(`   ✓ Found deflate64-compressed file: ${file.filename}`);
        }
    }

    passedCount++;
});

await TestUtils.test("Decompress deflate64 content from ZIP", async () => {
    testCount++;

    const zipResponse = await fetch(new URL("./data/lorem-deflate64.zip", import.meta.url));
    const zipData = new Uint8Array(await zipResponse.arrayBuffer());
    const files = parseZipFile(zipData);

    let deflate64FileFound = false;

    for (const file of files) {
        if (file.compressionMethod === 9) { // Deflate64
            deflate64FileFound = true;
            console.log(`   Found deflate64 file: ${file.filename}`);

            const compressedData = extractFileData(zipData, file);
            console.log(`   Extracted ${compressedData.length} bytes of compressed data`);

            // Try to actually decompress the data
            try {
                const decompressor = new DecompressionStream("deflate64-raw");
                const reader = decompressor.readable.getReader();
                const writer = decompressor.writable.getWriter();

                console.log(`   Attempting to decompress deflate64 data...`);

                // Write compressed data
                writer.write(compressedData);
                writer.close();

                // Read decompressed data
                const decompressedChunks = [];
                let result = await reader.read();
                while (!result.done) {
                    decompressedChunks.push(result.value);
                    result = await reader.read();
                }

                // Combine chunks
                const totalLength = decompressedChunks.reduce((sum, chunk) => sum + chunk.length, 0);
                const decompressed = new Uint8Array(totalLength);
                let offset = 0;
                for (const chunk of decompressedChunks) {
                    decompressed.set(chunk, offset);
                    offset += chunk.length;
                }

                console.log(`   ✓ Successfully decompressed to ${decompressed.length} bytes`);

                // Verify size matches expected
                if (decompressed.length === file.uncompressedSize) {
                    console.log(`   ✓ Decompressed size matches expected (${file.uncompressedSize} bytes)`);
                } else {
                    console.log(`   ⚠️  Size mismatch: got ${decompressed.length}, expected ${file.uncompressedSize}`);
                }

                // Try to decode as text
                try {
                    const text = new TextDecoder().decode(decompressed);
                    console.log(`   Content preview: "${text.slice(0, 100)}${text.length > 100 ? "..." : ""}"`);
                } catch {
                    console.log(`   Content appears to be binary data`);
                }

            } catch (error) {
                console.log(`   ❌ Deflate64 decompression failed: ${error.message}`);
                throw error; // Re-throw to fail the test
            }
        }
    }

    TestUtils.assert(deflate64FileFound, "ZIP should contain at least one deflate64-compressed file");
    passedCount++;
});

await TestUtils.test("Verify deflate64 compression method detection", async () => {
    testCount++;

    const zipResponse = await fetch(new URL("./data/lorem-deflate64.zip", import.meta.url));
    const zipData = new Uint8Array(await zipResponse.arrayBuffer());
    const files = parseZipFile(zipData);

    const deflate64Files = files.filter(f => f.compressionMethod === 9);
    TestUtils.assert(deflate64Files.length > 0, "Should find deflate64-compressed files");

    console.log(`   Found ${deflate64Files.length} deflate64-compressed file(s)`);
    for (const file of deflate64Files) {
        console.log(`   - ${file.filename} (${file.compressedSize} -> ${file.uncompressedSize} bytes)`);
        const ratio = ((file.compressedSize / file.uncompressedSize) * 100).toFixed(1);
        console.log(`     Compression ratio: ${ratio}%`);
    }

    passedCount++;
});

console.log(`\\nSummary: ${passedCount}/${testCount} tests passed`);
if (passedCount === testCount) {
    console.log("✓ All tests passed!");
} else {
    console.log("❌ Some tests failed!");
    Deno.exit(1);
}
