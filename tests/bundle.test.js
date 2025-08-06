#!/usr/bin/env deno run --allow-read --allow-net

import { TestUtils } from "./test-utils.js";

async function runBundleTests() {
	console.log("Bundle Tests");

	await TestUtils.test("Bundle imports and exports", async () => {
		try {
			// Import from the UMD bundle
			const { CompressionStream, DecompressionStream } = await import("../dist/zlib.js");

			if (typeof CompressionStream !== "function") {
				throw new Error("CompressionStream should be a function");
			}
			if (typeof DecompressionStream !== "function") {
				throw new Error("DecompressionStream should be a function");
			}

			console.log("   ✓ Bundle imported successfully");
			console.log(`   ✓ CompressionStream available: ${typeof CompressionStream}`);
			console.log(`   ✓ DecompressionStream available: ${typeof DecompressionStream}`);
		} catch (error) {
			throw new Error(`Failed to import bundle: ${error.message}`);
		}
	});

	await TestUtils.test("Bundle compression/decompression functionality", async () => {
		const { CompressionStream, DecompressionStream } = await import("../dist/zlib.js");

		const testData = new TextEncoder().encode("Hello, World! This is a test of the bundled zlib compression.");
		console.log(`   Original data: ${testData.length} bytes`);

		// Compress
		const compressionStream = new CompressionStream("deflate");
		const writer = compressionStream.writable.getWriter();
		const readerPromise = TestUtils.streamToUint8Array(compressionStream.readable);

		await writer.write(testData);
		await writer.close();

		const compressed = await readerPromise;
		console.log(
			`   Compressed: ${compressed.length} bytes (${(compressed.length / testData.length * 100).toFixed(1)}%)`,
		);

		// Decompress
		const decompressionStream = new DecompressionStream("deflate");
		const writer2 = decompressionStream.writable.getWriter();
		const readerPromise2 = TestUtils.streamToUint8Array(decompressionStream.readable);

		await writer2.write(compressed);
		await writer2.close();

		const decompressed = await readerPromise2;
		console.log(`   Decompressed: ${decompressed.length} bytes`);

		// Verify integrity
		const originalText = new TextDecoder().decode(testData);
		const decompressedText = new TextDecoder().decode(decompressed);

		TestUtils.assertEqual(decompressed.length, testData.length, "Decompressed length should match original");
		TestUtils.assertEqual(decompressedText, originalText, "Decompressed text should match original");

		console.log("   ✓ Data integrity verified - compression/decompression works perfectly!");
	});

	await TestUtils.test("Bundle supports multiple formats", async () => {
		const { CompressionStream, DecompressionStream } = await import("../dist/zlib.js");

		const testData = new TextEncoder().encode("Test data for format verification.");

		// Test deflate
		const deflateCompressed = await TestUtils.compressWithBundle(testData, "deflate", CompressionStream);
		const deflateDecompressed = await TestUtils.decompressWithBundle(
			deflateCompressed,
			"deflate",
			DecompressionStream,
		);
		TestUtils.assertArraysEqual(deflateDecompressed, testData, "Deflate round-trip should work");
		console.log(
			`   ✓ Deflate format: ${(deflateCompressed.length / testData.length * 100).toFixed(1)}% compression ratio`,
		);

		// Test gzip
		const gzipCompressed = await TestUtils.compressWithBundle(testData, "gzip", CompressionStream);
		const gzipDecompressed = await TestUtils.decompressWithBundle(gzipCompressed, "gzip", DecompressionStream);
		TestUtils.assertArraysEqual(gzipDecompressed, testData, "Gzip round-trip should work");
		console.log(
			`   ✓ Gzip format: ${(gzipCompressed.length / testData.length * 100).toFixed(1)}% compression ratio`,
		);
	});

	await TestUtils.test("Bundle handles large data correctly", async () => {
		const { CompressionStream, DecompressionStream } = await import("../dist/zlib.js");

		// Test with 50KB of data
		const largeData = TestUtils.generateTestData(50000);
		console.log(`   Testing with ${largeData.length} bytes of data...`);

		const compressed = await TestUtils.compressWithBundle(largeData, "deflate", CompressionStream);
		const decompressed = await TestUtils.decompressWithBundle(compressed, "deflate", DecompressionStream);

		TestUtils.assertEqual(decompressed.length, largeData.length, "Large data length should match");
		TestUtils.assertArraysEqual(decompressed, largeData, "Large data should compress/decompress correctly");

		console.log(`   ✓ Large data: ${largeData.length} -> ${compressed.length} -> ${decompressed.length} bytes`);
		console.log(`   ✓ Compression ratio: ${(compressed.length / largeData.length * 100).toFixed(2)}%`);
	});

	await TestUtils.test("Bundle is completely self-contained", async () => {
		// Test that the bundle doesn't depend on external files
		const { CompressionStream } = await import("../dist/zlib.js");

		// Try to use it immediately without any setup
		const testData = new TextEncoder().encode("Self-contained test");
		const stream = new CompressionStream("deflate");

		if (!(stream instanceof CompressionStream)) {
			throw new Error("Should create CompressionStream without external dependencies");
		}

		// Test that it can actually compress
		const writer = stream.writable.getWriter();
		const readerPromise = TestUtils.streamToUint8Array(stream.readable);

		await writer.write(testData);
		await writer.close();

		const result = await readerPromise;
		if (result.length === 0) {
			throw new Error("Should produce compressed output");
		}
		if (result.length >= testData.length + 20) {
			throw new Error("Should not have excessive overhead");
		}

		console.log("   ✓ Bundle works without any external dependencies");
	});

	TestUtils.printSummary();
}

// Add helper methods to TestUtils for bundle testing
TestUtils.compressWithBundle = async function (data, format, CompressionStream) {
	const stream = new CompressionStream(format);
	const writer = stream.writable.getWriter();
	const readerPromise = TestUtils.streamToUint8Array(stream.readable);

	await writer.write(data);
	await writer.close();

	return await readerPromise;
};

TestUtils.decompressWithBundle = async function (data, format, DecompressionStream) {
	const stream = new DecompressionStream(format);
	const writer = stream.writable.getWriter();
	const readerPromise = TestUtils.streamToUint8Array(stream.readable);

	await writer.write(data);
	await writer.close();

	return await readerPromise;
};

if (import.meta.main) {
	await runBundleTests();
}
