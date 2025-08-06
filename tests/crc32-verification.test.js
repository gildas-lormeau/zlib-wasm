#!/usr/bin/env deno run --allow-read --allow-net

import { TestUtils } from "./test-utils.js";

async function runCRC32VerificationTests() {
	console.log("CRC32 Verification Tests");

	await TestUtils.test("CRC32 verification - correct CRC32", async () => {
		const testData = TestUtils.stringToUint8Array("Hello, World! This is a test for CRC32 verification.");

		// First, compress the data and get the CRC32
		const { CompressionStream, DecompressionStream } = await TestUtils.importCompressionStreams();
		const compressionStream = new CompressionStream("deflate-raw", { computeCRC32: true });

		// Use safer pipeline pattern for compression
		const compressedData = await TestUtils.streamToUint8Array(
			new ReadableStream({
				start(controller) {
					controller.enqueue(testData);
					controller.close();
				},
			}).pipeThrough(compressionStream),
		);
		const expectedCRC32 = compressionStream.crc32;

		// Now decompress with CRC32 verification using pipeline pattern
		const decompressionStream = new DecompressionStream("deflate-raw", { expectedCRC32 });
		const decompressedData = await TestUtils.streamToUint8Array(
			new ReadableStream({
				start(controller) {
					controller.enqueue(compressedData);
					controller.close();
				},
			}).pipeThrough(decompressionStream),
		);

		// Verify the data matches
		TestUtils.assertEqual(TestUtils.uint8ArrayToString(decompressedData), TestUtils.uint8ArrayToString(testData));

		// Verify CRC32 was computed during decompression
		TestUtils.assertEqual(decompressionStream.crc32, expectedCRC32);
	});

	await TestUtils.test("CRC32 verification - incorrect CRC32 throws error", async () => {
		const testData = TestUtils.stringToUint8Array("Hello, World! This is a test for CRC32 verification.");

		// First, compress the data
		const { CompressionStream, DecompressionStream } = await TestUtils.importCompressionStreams();
		const compressionStream = new CompressionStream("deflate-raw", { computeCRC32: true });

		// Use safer pipeline pattern for compression
		const compressedData = await TestUtils.streamToUint8Array(
			new ReadableStream({
				start(controller) {
					controller.enqueue(testData);
					controller.close();
				},
			}).pipeThrough(compressionStream),
		);
		const correctCRC32 = compressionStream.crc32;

		// Use an incorrect CRC32 value
		const incorrectCRC32 = correctCRC32 ^ 0xFFFFFFFF; // Flip all bits to ensure it's different

		// Try to decompress with incorrect CRC32 using safer pipeline pattern
		const decompressionStream = new DecompressionStream("deflate-raw", { expectedCRC32: incorrectCRC32 });

		let errorCaught = false;
		let actualError = null;

		try {
			// Use pipeline pattern which properly handles errors
			await TestUtils.streamToUint8Array(
				new ReadableStream({
					start(controller) {
						controller.enqueue(compressedData);
						controller.close();
					},
				}).pipeThrough(decompressionStream),
			);

			TestUtils.assert(false, "Expected CRC32 verification to throw an error");
		} catch (error) {
			errorCaught = true;
			actualError = error;
		}

		TestUtils.assert(errorCaught, "Expected an error to be thrown for CRC32 mismatch");
		TestUtils.assert(
			actualError && actualError.message.includes("CRC32 mismatch"),
			`Expected CRC32 mismatch error, got: ${actualError ? actualError.message : "no error"}`,
		);
		TestUtils.assert(
			actualError.message.includes(correctCRC32.toString(16).toUpperCase().padStart(8, "0")),
			"Error should include actual CRC32",
		);
		TestUtils.assert(
			actualError.message.includes(incorrectCRC32.toString(16).toUpperCase().padStart(8, "0")),
			"Error should include expected CRC32",
		);
	});

	await TestUtils.test("CRC32 verification - not enabled for non-raw formats", async () => {
		const testData = TestUtils.stringToUint8Array("Hello, World!");

		// Compress with deflate (not deflate-raw)
		const { DecompressionStream } = await TestUtils.importCompressionStreams();
		const compressedData = await TestUtils.compressData(testData, "deflate");

		// Try to decompress with CRC32 verification (should be ignored for non-raw formats)
		const decompressionStream = new DecompressionStream("deflate", { expectedCRC32: 0x12345678 });

		// Use safer pipeline pattern
		const decompressedData = await TestUtils.streamToUint8Array(
			new ReadableStream({
				start(controller) {
					controller.enqueue(compressedData);
					controller.close();
				},
			}).pipeThrough(decompressionStream),
		);

		// Should not throw error and should decompress correctly
		TestUtils.assertEqual(TestUtils.uint8ArrayToString(decompressedData), TestUtils.uint8ArrayToString(testData));

		// CRC32 should remain 0 since verification is not enabled
		TestUtils.assertEqual(decompressionStream.crc32, 0);
	});

	await TestUtils.test("CRC32 verification - no expectedCRC32 option means no verification", async () => {
		const testData = TestUtils.stringToUint8Array("Hello, World!");

		// Compress with deflate-raw
		const { DecompressionStream } = await TestUtils.importCompressionStreams();
		const compressedData = await TestUtils.compressData(testData, "deflate-raw");

		// Decompress without expectedCRC32 option
		const decompressionStream = new DecompressionStream("deflate-raw");

		// Use safer pipeline pattern
		const decompressedData = await TestUtils.streamToUint8Array(
			new ReadableStream({
				start(controller) {
					controller.enqueue(compressedData);
					controller.close();
				},
			}).pipeThrough(decompressionStream),
		);

		// Should decompress correctly without verification
		TestUtils.assertEqual(TestUtils.uint8ArrayToString(decompressedData), TestUtils.uint8ArrayToString(testData));

		// CRC32 should remain 0 since verification is not enabled
		TestUtils.assertEqual(decompressionStream.crc32, 0);
	});

	TestUtils.printSummary();
}

if (import.meta.main) {
	await runCRC32VerificationTests();
}
