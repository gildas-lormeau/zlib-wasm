#!/usr/bin/env deno run --allow-read --allow-net

import { TestUtils } from "./test-utils.js";

async function verifyBugFix() {
	console.log("Large Data Bug Fix Verification");

	await TestUtils.test("Multiple large data sizes", async () => {
		const sizes = [32768, 32769, 65536, 100000, 150000, 200000, 500000, 10000000];

		for (const size of sizes) {
			console.log(`   Testing ${size} bytes...`);

			const testData = TestUtils.generateTestData(size);
			const compressed = await TestUtils.compressData(testData, "deflate");
			const decompressed = await TestUtils.decompressData(compressed, "deflate");

			TestUtils.assertEqual(decompressed.length, testData.length, `Size ${size} length should match`);

			// Spot check at various points
			const checkPoints = [0, Math.floor(size / 4), Math.floor(size / 2), Math.floor(3 * size / 4), size - 1];
			for (const point of checkPoints) {
				TestUtils.assertEqual(
					decompressed[point],
					testData[point],
					`Byte ${point} should match for size ${size}`,
				);
			}

			console.log(
				`   ✓ Size ${size}: ${compressed.length} bytes compressed (${(compressed.length / size * 100).toFixed(2)
				}%)`,
			);
		}
	});

	await TestUtils.test("Streaming large data", async () => {
		const { CompressionStream } = await TestUtils.importCompressionStreams();
		const size = 150000;
		const originalData = TestUtils.generateTestData(size);

		console.log(`   Testing streaming compression/decompression of ${size} bytes`);

		// Streaming compression
		const compressionStream = new CompressionStream("deflate");
		const writer = compressionStream.writable.getWriter();
		const readerPromise = TestUtils.streamToUint8Array(compressionStream.readable);

		// Write in various chunk sizes to test different scenarios
		const chunkSizes = [1000, 5000, 10000];
		let offset = 0;
		let chunkIndex = 0;

		while (offset < size) {
			const chunkSize = chunkSizes[chunkIndex % chunkSizes.length];
			const actualChunkSize = Math.min(chunkSize, size - offset);
			const chunk = originalData.slice(offset, offset + actualChunkSize);

			await writer.write(chunk);
			offset += actualChunkSize;
			chunkIndex++;
		}
		await writer.close();

		const compressed = await readerPromise;
		const decompressed = await TestUtils.decompressData(compressed, "deflate");

		TestUtils.assertArraysEqual(decompressed, originalData, "Large streaming data should match exactly");
		console.log(`   ✓ Streaming: ${size} -> ${compressed.length} -> ${decompressed.length} bytes`);
	});

	await TestUtils.test("Large random data integrity", async () => {
		const size = 50000; // Reduced to stay within Deno's random data limit
		const randomData = TestUtils.generateRandomData(size);

		console.log(`   Testing ${size} bytes of random data (hardest to compress)`);

		const compressed = await TestUtils.compressData(randomData, "deflate");
		const decompressed = await TestUtils.decompressData(compressed, "deflate");

		TestUtils.assertArraysEqual(decompressed, randomData, "Large random data should maintain perfect integrity");

		const compressionRatio = compressed.length / size;
		console.log(
			`   ✓ Random data: ${(compressionRatio * 100).toFixed(2)
			}% compression ratio (expected ~100% for random data)`,
		);
	});

	TestUtils.printSummary();
}

if (import.meta.main) {
	await verifyBugFix();
}
