#!/usr/bin/env deno run --allow-read --allow-net

import { TestUtils } from "./test-utils.js";

async function runBasicCompressionTests() {
	console.log("Basic Compression/Decompression Tests");

	await TestUtils.test("Simple text compression and decompression", async () => {
		const originalText = "Hello, World! This is a test string for compression. ".repeat(10);
		const originalData = TestUtils.stringToUint8Array(originalText);

		// Compress the data
		const compressed = await TestUtils.compressData(originalData, "deflate");
		TestUtils.assert(compressed.length > 0, "Compressed data should not be empty");
		TestUtils.assert(compressed.length < originalData.length, "Compressed data should be smaller than original");

		// Decompress the data
		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, originalData, "Decompressed data should match original");

		const decompressedText = TestUtils.uint8ArrayToString(decompressed);
		TestUtils.assertEqual(decompressedText, originalText, "Decompressed text should match original");
	});

	await TestUtils.test("Empty data compression", async () => {
		const emptyData = new Uint8Array(0);

		const compressed = await TestUtils.compressData(emptyData, "deflate");
		TestUtils.assert(compressed.length > 0, "Compressed empty data should produce some output");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, emptyData, "Decompressed empty data should be empty");
	});

	await TestUtils.test("Single byte compression", async () => {
		const singleByte = new Uint8Array([42]);

		const compressed = await TestUtils.compressData(singleByte, "deflate");
		TestUtils.assert(compressed.length > 0, "Compressed single byte should produce output");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, singleByte, "Decompressed single byte should match original");
	});

	await TestUtils.test("Repetitive data compression", async () => {
		const repetitiveData = new Uint8Array(1000).fill(65); // 1000 'A' characters

		const compressed = await TestUtils.compressData(repetitiveData, "deflate");
		TestUtils.assert(compressed.length > 0, "Compressed repetitive data should produce output");
		TestUtils.assert(compressed.length < repetitiveData.length, "Repetitive data should compress well");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, repetitiveData, "Decompressed repetitive data should match original");
	});

	await TestUtils.test("Random data compression", async () => {
		const randomData = TestUtils.generateRandomData(500);

		const compressed = await TestUtils.compressData(randomData, "deflate");
		TestUtils.assert(compressed.length > 0, "Compressed random data should produce output");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, randomData, "Decompressed random data should match original");
	});

	await TestUtils.test("Large data compression", async () => {
		const largeData = TestUtils.generateTestData(10000);

		const compressed = await TestUtils.compressData(largeData, "deflate");
		TestUtils.assert(compressed.length > 0, "Compressed large data should produce output");
		TestUtils.assert(compressed.length < largeData.length, "Large patterned data should compress well");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, largeData, "Decompressed large data should match original");
	});

	await TestUtils.test("Binary data with null bytes", async () => {
		const binaryData = new Uint8Array([0, 1, 2, 0, 255, 0, 128, 0, 64]);

		const compressed = await TestUtils.compressData(binaryData, "deflate");
		TestUtils.assert(compressed.length > 0, "Compressed binary data should produce output");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, binaryData, "Decompressed binary data should match original");
	});

	await TestUtils.test("Level 0 compression (deflate-raw)", async () => {
		const testData = TestUtils.stringToUint8Array("Hello, World! This is a test of level 0 compression.");
		
		// Test level 0 compression with deflate-raw
		const { CompressionStream } = await TestUtils.importCompressionStreams();
		const compressor = new CompressionStream("deflate-raw", { level: 0 });
		
		const writer = compressor.writable.getWriter();
		const readerPromise = TestUtils.streamToUint8Array(compressor.readable);
		
		await writer.write(testData);
		await writer.close();
		const compressed = await readerPromise;
		
		// Level 0 should return data as-is for deflate-raw
		TestUtils.assertArraysEqual(compressed, testData, "Level 0 deflate-raw should return data unchanged");
		
		console.log(`   Level 0: ${testData.length} -> ${compressed.length} bytes (${((compressed.length / testData.length) * 100).toFixed(1)}% ratio)`);
		console.log(`   ✓ Level 0 compression returns raw data without any compression overhead`);
		
		// Test level 0 with CRC32 computation
		const compressorWithCRC = new CompressionStream("deflate-raw", { level: 0, computeCRC32: true });
		const writerCRC = compressorWithCRC.writable.getWriter();
		const readerPromiseCRC = TestUtils.streamToUint8Array(compressorWithCRC.readable);
		
		await writerCRC.write(testData);
		await writerCRC.close();
		const compressedCRC = await readerPromiseCRC;
		
		// Should still return data as-is but with CRC32 computed
		TestUtils.assertArraysEqual(compressedCRC, testData, "Level 0 deflate-raw with CRC32 should return data unchanged");
		TestUtils.assert(compressorWithCRC.crc32 !== 0, "CRC32 should be computed for level 0 compression");
		
		console.log(`   ✓ Level 0 with CRC32: 0x${compressorWithCRC.crc32.toString(16).padStart(8, '0').toUpperCase()}`);
	});

	await TestUtils.test("Web Worker compression/decompression", async () => {
		console.log("   Testing CompressionStream/DecompressionStream in Web Worker");

		// Create a web worker
		const workerUrl = new URL("./test-compression-worker.js", import.meta.url);
		const worker = new Worker(workerUrl.href, { type: "module" });

		// Helper to send messages to worker and wait for response
		function sendToWorker(type, data = {}) {
			return new Promise((resolve, reject) => {
				const id = Math.random().toString(36).substr(2, 9);

				const timeout = setTimeout(() => {
					reject(new Error(`Worker timeout for ${type}`));
				}, 10000); // 10 second timeout

				function handleMessage(event) {
					if (event.data.id === id) {
						clearTimeout(timeout);
						worker.removeEventListener("message", handleMessage);

						if (event.data.success) {
							resolve(event.data.data);
						} else {
							reject(new Error(event.data.error));
						}
					}
				}

				worker.addEventListener("message", handleMessage);
				worker.postMessage({ id, type, data });
			});
		}

		try {
			// Initialize the worker
			await sendToWorker("init");
			console.log("   ✓ Worker initialized successfully");

			// Test data
			const testText = "Hello from Web Worker! This is a compression test. ".repeat(20);
			const testData = new TextEncoder().encode(testText);

			// Test compression in worker
			const compressedData = await sendToWorker("compress", {
				inputData: Array.from(testData),
				format: "deflate",
			});

			TestUtils.assert(compressedData.length > 0, "Worker should produce compressed data");
			TestUtils.assert(compressedData.length < testData.length, "Worker compression should reduce size");
			console.log(`   ✓ Worker compression: ${testData.length} -> ${compressedData.length} bytes`);

			// Test decompression in worker
			const decompressedData = await sendToWorker("decompress", {
				compressedData: compressedData,
				format: "deflate",
			});

			const decompressed = new Uint8Array(decompressedData);
			TestUtils.assertArraysEqual(decompressed, testData, "Worker decompression should match original");
			console.log(`   ✓ Worker decompression: ${compressedData.length} -> ${decompressed.length} bytes`);

			// Test complete round-trip in worker
			const roundTripResult = await sendToWorker("round-trip", {
				originalData: Array.from(testData),
				testFormat: "deflate",
			});

			TestUtils.assert(roundTripResult.dataMatches, "Worker round-trip should preserve data integrity");
			TestUtils.assertEqual(roundTripResult.originalSize, testData.length, "Original size should match");
			TestUtils.assertEqual(roundTripResult.decompressedSize, testData.length, "Decompressed size should match");
			console.log(`   ✓ Worker round-trip: ${roundTripResult.compressionRatio}% compression ratio`);

			// Test with different formats
			for (const format of ["deflate", "gzip"]) {
				const formatResult = await sendToWorker("round-trip", {
					originalData: Array.from(testData),
					testFormat: format,
				});

				TestUtils.assert(formatResult.dataMatches, `Worker should handle ${format} format correctly`);
				console.log(`   ✓ Worker ${format} format: ${formatResult.compressionRatio}% compression ratio`);
			}

			console.log("   ✓ All worker tests completed successfully");
		} finally {
			// Clean up worker
			worker.terminate();
		}
	});

	TestUtils.printSummary();
}

if (import.meta.main) {
	await runBasicCompressionTests();
}
