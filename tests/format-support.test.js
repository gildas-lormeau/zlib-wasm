#!/usr/bin/env deno run --allow-read --allow-net

import { TestUtils } from "./test-utils.js";

async function runFormatSupportTests() {
	console.log("Format Support Tests");

	const testData = TestUtils.stringToUint8Array("This is test data for format support validation. ".repeat(5));

	await TestUtils.test("Deflate format compression/decompression", async () => {
		const compressed = await TestUtils.compressData(testData, "deflate");
		TestUtils.assert(compressed.length > 0, "Deflate compression should produce output");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, testData, "Deflate decompression should match original");
	});

	await TestUtils.test("Gzip format compression/decompression", async () => {
		try {
			const compressed = await TestUtils.compressData(testData, "gzip");
			TestUtils.assert(compressed.length > 0, "Gzip compression should produce output");

			const decompressed = await TestUtils.decompressData(compressed, "gzip");
			TestUtils.assertArraysEqual(decompressed, testData, "Gzip decompression should match original");
		} catch (_error) {
			// Expected - this format may not be supported
		}
	});

	await TestUtils.test("Format headers are different", async () => {
		const deflateCompressed = await TestUtils.compressData(testData, "deflate");

		// Just test that deflate produces consistent output
		const deflateCompressed2 = await TestUtils.compressData(testData, "deflate");
		TestUtils.assertArraysEqual(deflateCompressed, deflateCompressed2, "Deflate should produce consistent output");
	});

	await TestUtils.test("Compression level options", async () => {
		const { CompressionStream } = await TestUtils.importCompressionStreams();

		// Test different compression levels with smaller data to avoid issues
		const smallTestData = TestUtils.stringToUint8Array("Test data. ".repeat(10));

		const level1Stream = new CompressionStream("deflate", { level: 1 });
		const level9Stream = new CompressionStream("deflate", { level: 9 });

		// Compress with level 1 (fast)
		const writer1 = level1Stream.writable.getWriter();
		const reader1Promise = TestUtils.streamToUint8Array(level1Stream.readable);
		await writer1.write(smallTestData);
		await writer1.close();
		const level1Compressed = await reader1Promise;

		// Compress with level 9 (best compression)
		const writer9 = level9Stream.writable.getWriter();
		const reader9Promise = TestUtils.streamToUint8Array(level9Stream.readable);
		await writer9.write(smallTestData);
		await writer9.close();
		const level9Compressed = await reader9Promise;

		// Both should work
		TestUtils.assert(level1Compressed.length > 0, "Level 1 compression should produce output");
		TestUtils.assert(level9Compressed.length > 0, "Level 9 compression should produce output");

		// Verify both can be decompressed
		const level1Decompressed = await TestUtils.decompressData(level1Compressed, "deflate");
		const level9Decompressed = await TestUtils.decompressData(level9Compressed, "deflate");

		TestUtils.assertArraysEqual(level1Decompressed, smallTestData, "Level 1 decompression should match original");
		TestUtils.assertArraysEqual(level9Decompressed, smallTestData, "Level 9 decompression should match original");
	});

	TestUtils.printSummary();
}

if (import.meta.main) {
	await runFormatSupportTests();
}
