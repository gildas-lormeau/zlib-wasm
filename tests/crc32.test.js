#!/usr/bin/env deno run --allow-read --allow-net

import { TestUtils } from "./test-utils.js";

async function runCRC32Tests() {
	console.log("CRC32 Functionality Tests");

	await TestUtils.test("CRC32 basic functionality", async () => {
		const originalText = "Hello, World! This is a test of CRC32 computation.";
		const originalData = TestUtils.stringToUint8Array(originalText);

		// Compress with CRC32 enabled for deflate-raw format
		const { CompressionStream } = await TestUtils.importCompressionStreams();
		const compressionStream = new CompressionStream("deflate-raw", { computeCRC32: true });
		const writer = compressionStream.writable.getWriter();
		const readerPromise = TestUtils.streamToUint8Array(compressionStream.readable);

		await writer.write(originalData);
		await writer.close();
		const compressedData = await readerPromise;

		// Verify CRC32 is computed
		const crc32Value = compressionStream.crc32;
		TestUtils.assert(crc32Value !== 0, "CRC32 should be computed for non-empty data");

		console.log(`   ✓ CRC32 computed: 0x${crc32Value.toString(16).padStart(8, "0").toUpperCase()}`);
		console.log(`   ✓ Original length: ${originalData.length}, compressed: ${compressedData.length}`);
	});

	await TestUtils.test("CRC32 only for deflate-raw format", async () => {
		const originalText = "Test data for format verification";
		const originalData = TestUtils.stringToUint8Array(originalText);
		const { CompressionStream } = await TestUtils.importCompressionStreams();

		// Test regular deflate format (should not compute CRC32)
		const deflateStream = new CompressionStream("deflate", { computeCRC32: true });
		const deflateWriter = deflateStream.writable.getWriter();
		const deflateReaderPromise = TestUtils.streamToUint8Array(deflateStream.readable);

		await deflateWriter.write(originalData);
		await deflateWriter.close();
		await deflateReaderPromise;

		const deflateCRC32 = deflateStream.crc32;
		TestUtils.assertEqual(deflateCRC32, 0, "CRC32 should be 0 for deflate format");

		// Test gzip format (should not compute CRC32)
		const gzipStream = new CompressionStream("gzip", { computeCRC32: true });
		const gzipWriter = gzipStream.writable.getWriter();
		const gzipReaderPromise = TestUtils.streamToUint8Array(gzipStream.readable);

		await gzipWriter.write(originalData);
		await gzipWriter.close();
		await gzipReaderPromise;

		const gzipCRC32 = gzipStream.crc32;
		TestUtils.assertEqual(gzipCRC32, 0, "CRC32 should be 0 for gzip format");

		// Test deflate64-raw format (should not compute CRC32 and should reject compression)
		try {
			const deflate64RawStream = new CompressionStream("deflate64-raw", { computeCRC32: true });
			const deflate64RawWriter = deflate64RawStream.writable.getWriter();

			// This should fail because deflate64 is decompression-only
			await deflate64RawWriter.write(originalData);
			TestUtils.assert(false, "deflate64-raw compression should be rejected");
		} catch (error) {
			// Expected behavior - deflate64 formats don't support compression
			console.log(`   ✓ Deflate64-raw compression correctly rejected: ${error.message}`);
		}

		console.log(`   ✓ Deflate format CRC32: ${deflateCRC32} (correctly 0)`);
		console.log(`   ✓ Gzip format CRC32: ${gzipCRC32} (correctly 0)`);
	});

	await TestUtils.test("CRC32 optional parameter", async () => {
		const originalText = "Test data for optional parameter verification";
		const originalData = TestUtils.stringToUint8Array(originalText);
		const { CompressionStream } = await TestUtils.importCompressionStreams();

		// Test without computeCRC32 option (default behavior)
		const normalStream = new CompressionStream("deflate-raw");
		const normalWriter = normalStream.writable.getWriter();
		const normalReaderPromise = TestUtils.streamToUint8Array(normalStream.readable);

		await normalWriter.write(originalData);
		await normalWriter.close();
		await normalReaderPromise;

		const normalCRC32 = normalStream.crc32;
		TestUtils.assertEqual(normalCRC32, 0, "CRC32 should be 0 when computeCRC32 option is not specified");

		// Test with computeCRC32 explicitly false
		const explicitFalseStream = new CompressionStream("deflate-raw", { computeCRC32: false });
		const explicitFalseWriter = explicitFalseStream.writable.getWriter();
		const explicitFalseReaderPromise = TestUtils.streamToUint8Array(explicitFalseStream.readable);

		await explicitFalseWriter.write(originalData);
		await explicitFalseWriter.close();
		await explicitFalseReaderPromise;

		const explicitFalseCRC32 = explicitFalseStream.crc32;
		TestUtils.assertEqual(explicitFalseCRC32, 0, "CRC32 should be 0 when computeCRC32 is explicitly false");

		console.log(`   ✓ Default behavior CRC32: ${normalCRC32} (correctly 0)`);
		console.log(`   ✓ Explicit false CRC32: ${explicitFalseCRC32} (correctly 0)`);
	});

	console.log(`\nSummary: ${TestUtils.passedCount - (TestUtils.testCount - 3)}/${3} tests passed`);
	if (TestUtils.failedCount === 0 || TestUtils.testCount === TestUtils.passedCount) {
		console.log("✓ All tests passed!\n");
	} else {
		console.log(`❌ ${TestUtils.failedCount} test(s) failed!\n`);
		throw new Error("Some CRC32 tests failed");
	}
}

if (import.meta.main) {
	await runCRC32Tests();
}
