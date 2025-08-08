#!/usr/bin/env deno run --allow-read --allow-net

import { DecompressionStream } from "../src/index.js";

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
	},
};

function calculateCRC32(data) {
	const crcTable = new Uint32Array(256);
	for (let i = 0; i < 256; i++) {
		let crc = i;
		for (let j = 0; j < 8; j++) {
			if (crc & 1) {
				crc = (crc >>> 1) ^ 0xEDB88320;
			} else {
				crc = crc >>> 1;
			}
		}
		crcTable[i] = crc;
	}
	let crc = 0xFFFFFFFF;
	for (let i = 0; i < data.length; i++) {
		const byte = data[i];
		crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xFF];
	}
	return (crc ^ 0xFFFFFFFF) >>> 0;
}

function parseZipFile(zipData) {
	const view = new DataView(zipData.buffer);
	const files = [];
	let centralDirOffset = -1;
	for (let i = zipData.length - 22; i >= 0; i--) {
		if (view.getUint32(i, true) === 0x06054b50) {
			centralDirOffset = view.getUint32(i + 16, true);
			break;
		}
	}
	if (centralDirOffset === -1) {
		throw new Error("Invalid ZIP file: Central directory not found");
	}
	let offset = centralDirOffset;
	while (offset < zipData.length - 22) {
		const signature = view.getUint32(offset, true);
		if (signature !== 0x02014b50) break;
		const compressionMethod = view.getUint16(offset + 10, true);
		const crc32 = view.getUint32(offset + 16, true);
		const compressedSize = view.getUint32(offset + 20, true);
		const uncompressedSize = view.getUint32(offset + 24, true);
		const filenameLength = view.getUint16(offset + 28, true);
		const extraFieldLength = view.getUint16(offset + 30, true);
		const commentLength = view.getUint16(offset + 32, true);
		const localHeaderOffset = view.getUint32(offset + 42, true);
		const filename = new TextDecoder().decode(
			zipData.slice(offset + 46, offset + 46 + filenameLength),
		);
		files.push({
			filename,
			compressionMethod,
			crc32,
			compressedSize,
			uncompressedSize,
			localHeaderOffset,
		});
		offset += 46 + filenameLength + extraFieldLength + commentLength;
	}
	return files;
}

function extractFileData(zipData, fileEntry) {
	const view = new DataView(zipData.buffer);
	const localHeaderOffset = fileEntry.localHeaderOffset;
	const signature = view.getUint32(localHeaderOffset, true);
	if (signature !== 0x04034b50) {
		throw new Error("Invalid local file header signature");
	}
	const filenameLength = view.getUint16(localHeaderOffset + 26, true);
	const extraFieldLength = view.getUint16(localHeaderOffset + 28, true);
	const dataOffset = localHeaderOffset + 30 + filenameLength + extraFieldLength;
	return zipData.slice(dataOffset, dataOffset + fileEntry.compressedSize);
}

async function decompressWithChunking(compressedData, chunkSize) {
	const decompressor = new DecompressionStream("deflate64-raw");
	const reader = decompressor.readable.getReader();
	const writer = decompressor.writable.getWriter();

	const readPromise = (async () => {
		const chunks = [];
		let result;
		while (!(result = await reader.read()).done) {
			chunks.push(result.value);
		}
		const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
		const combined = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of chunks) {
			combined.set(chunk, offset);
			offset += chunk.length;
		}
		return combined;
	})();

	for (let i = 0; i < compressedData.length; i += chunkSize) {
		const chunk = compressedData.slice(i, Math.min(i + chunkSize, compressedData.length));
		await writer.write(chunk);
	}
	await writer.close();

	return await readPromise;
}

console.log("Deflate64 Streaming Tests");

let testCount = 0;
let passedCount = 0;

await TestUtils.test("Deflate64 streaming with various chunk sizes", async () => {
	testCount++;

	const zipResponse = await fetch(new URL("./data/lorem-deflate64.zip", import.meta.url));
	const zipData = new Uint8Array(await zipResponse.arrayBuffer());
	const files = parseZipFile(zipData);
	
	const deflate64File = files.find(f => f.compressionMethod === 9);
	TestUtils.assert(deflate64File, "ZIP should contain a deflate64 file");
	
	console.log(`   Testing file: ${deflate64File.filename}`);
	console.log(`   Compressed size: ${deflate64File.compressedSize} bytes`);
	console.log(`   Expected output: ${deflate64File.uncompressedSize} bytes`);
	
	const compressedData = extractFileData(zipData, deflate64File);
	const chunkSizes = [1, 16, 64, 128, 512, 1024, 2048, compressedData.length];
	
	for (const chunkSize of chunkSizes) {
		console.log(`   Testing chunk size: ${chunkSize} bytes`);
		
		try {
			const decompressed = await decompressWithChunking(compressedData, chunkSize);
			
			TestUtils.assert(
				decompressed.length === deflate64File.uncompressedSize,
				`Size mismatch with chunk size ${chunkSize}: got ${decompressed.length}, expected ${deflate64File.uncompressedSize}`
			);
			
			const calculatedCRC = calculateCRC32(decompressed);
			TestUtils.assert(
				calculatedCRC === deflate64File.crc32,
				`CRC mismatch with chunk size ${chunkSize}: got 0x${calculatedCRC.toString(16)}, expected 0x${deflate64File.crc32.toString(16)}`
			);
			
			console.log(`     ✓ Success: ${decompressed.length} bytes output`);
		} catch (error) {
			throw new Error(`Failed with chunk size ${chunkSize}: ${error.message}`);
		}
	}
	
	console.log(`   ✓ All chunk sizes work correctly`);
	passedCount++;
});

await TestUtils.test("Deflate64 single write vs streaming equivalence", async () => {
	testCount++;

	const zipResponse = await fetch(new URL("./data/lorem-deflate64.zip", import.meta.url));
	const zipData = new Uint8Array(await zipResponse.arrayBuffer());
	const files = parseZipFile(zipData);
	
	const deflate64File = files.find(f => f.compressionMethod === 9);
	const compressedData = extractFileData(zipData, deflate64File);
	
	console.log(`   Comparing single write vs small chunks (128 bytes)`);
	
	const singleWriteResult = await decompressWithChunking(compressedData, compressedData.length);
	const streamingResult = await decompressWithChunking(compressedData, 128);
	
	TestUtils.assert(
		singleWriteResult.length === streamingResult.length,
		`Length mismatch: single=${singleWriteResult.length}, streaming=${streamingResult.length}`
	);
	
	for (let i = 0; i < singleWriteResult.length; i++) {
		TestUtils.assert(
			singleWriteResult[i] === streamingResult[i],
			`Content mismatch at byte ${i}`
		);
	}
	
	console.log(`   ✓ Single write and streaming produce identical results`);
	passedCount++;
});

console.log(`\\nSummary: ${passedCount}/${testCount} tests passed`);
if (passedCount === testCount) {
	console.log("✓ All deflate64 streaming tests passed!");
} else {
	console.log("❌ Some tests failed!");
	Deno.exit(1);
}
