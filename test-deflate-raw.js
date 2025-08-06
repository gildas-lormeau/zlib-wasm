// Test deflate-raw support
import { CompressionStream, DecompressionStream, initModule } from './src/mod.js';
import { readFileSync } from 'fs';

async function testDeflateRaw() {
    // Initialize the module
    const wasmBinary = readFileSync('./dist-wasm/zlib-module.wasm');
    const moduleCode = readFileSync('./dist-wasm/zlib-module.js', 'utf8');
    await initModule(moduleCode, wasmBinary);

    console.log('Testing deflate-raw compression/decompression...');
    
    const testData = new TextEncoder().encode('Hello, deflate-raw world! This is a test of raw deflate format.');
    console.log('Original data length:', testData.length);
    
    // Test compression
    const compressor = new CompressionStream('deflate-raw');
    const reader = compressor.readable.getReader();
    const writer = compressor.writable.getWriter();
    
    writer.write(testData);
    writer.close();
    
    const compressedChunks = [];
    let result = await reader.read();
    while (!result.done) {
        compressedChunks.push(result.value);
        result = await reader.read();
    }
    
    const compressed = new Uint8Array(compressedChunks.reduce((acc, chunk) => acc + chunk.length, 0));
    let offset = 0;
    for (const chunk of compressedChunks) {
        compressed.set(chunk, offset);
        offset += chunk.length;
    }
    
    console.log('Compressed data length:', compressed.length);
    
    // Test decompression
    const decompressor = new DecompressionStream('deflate-raw');
    const reader2 = decompressor.readable.getReader();
    const writer2 = decompressor.writable.getWriter();
    
    writer2.write(compressed);
    writer2.close();
    
    const decompressedChunks = [];
    let result2 = await reader2.read();
    while (!result2.done) {
        decompressedChunks.push(result2.value);
        result2 = await reader2.read();
    }
    
    const decompressed = new Uint8Array(decompressedChunks.reduce((acc, chunk) => acc + chunk.length, 0));
    offset = 0;
    for (const chunk of decompressedChunks) {
        decompressed.set(chunk, offset);
        offset += chunk.length;
    }
    
    const resultText = new TextDecoder().decode(decompressed);
    console.log('Decompressed data length:', decompressed.length);
    console.log('Result:', resultText);
    console.log('✓ deflate-raw test', resultText === 'Hello, deflate-raw world! This is a test of raw deflate format.' ? 'PASSED' : 'FAILED');
}

testDeflateRaw().catch(console.error);
