#!/usr/bin/env deno run --allow-read --allow-net

import { TestUtils } from "./test-utils.js";

async function runEdgeCasesTests() {
	console.log("Edge Cases Tests");

	await TestUtils.test("Zero-length input", async () => {
		const emptyData = new Uint8Array(0);

		const compressed = await TestUtils.compressData(emptyData, "deflate");
		TestUtils.assert(compressed.length > 0, "Empty data compression should still produce header/footer");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertEqual(decompressed.length, 0, "Decompressed empty data should be empty");
	});

	await TestUtils.test("Single byte variations", async () => {
		for (let byte = 0; byte < 256; byte += 51) { // Test every 51st byte value
			const singleByteData = new Uint8Array([byte]);

			const compressed = await TestUtils.compressData(singleByteData, "deflate");
			TestUtils.assert(compressed.length > 0, `Single byte ${byte} compression should work`);

			const decompressed = await TestUtils.decompressData(compressed, "deflate");
			TestUtils.assertArraysEqual(
				decompressed,
				singleByteData,
				`Single byte ${byte} should decompress correctly`,
			);
		}
	});

	await TestUtils.test("All byte values", async () => {
		const allBytes = new Uint8Array(256);
		for (let i = 0; i < 256; i++) {
			allBytes[i] = i;
		}

		const compressed = await TestUtils.compressData(allBytes, "deflate");
		TestUtils.assert(compressed.length > 0, "All byte values compression should work");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, allBytes, "All byte values should decompress correctly");
	});

	await TestUtils.test("Maximum compression scenarios", async () => {
		// Create highly repetitive data
		const repetitiveData = new Uint8Array(10000).fill(0);

		const compressed = await TestUtils.compressData(repetitiveData, "deflate");
		const compressionRatio = compressed.length / repetitiveData.length;

		console.log(`   Maximum compression ratio: ${(compressionRatio * 100).toFixed(4)}%`);
		TestUtils.assert(compressionRatio < 0.01, "Highly repetitive data should achieve very high compression");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, repetitiveData, "Maximum compression should decompress correctly");
	});

	await TestUtils.test("Minimum compression scenarios", async () => {
		// Create highly random data
		const randomData = TestUtils.generateRandomData(1000);

		const compressed = await TestUtils.compressData(randomData, "deflate");
		const compressionRatio = compressed.length / randomData.length;

		console.log(`   Minimum compression ratio: ${(compressionRatio * 100).toFixed(2)}%`);
		TestUtils.assert(compressionRatio > 0.95, "Random data should achieve minimal compression");

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, randomData, "Minimal compression should decompress correctly");
	});

	await TestUtils.test("Boundary size data", async () => {
		const sizes = [1, 2, 3, 4, 7, 8, 9, 15, 16, 17, 31, 32, 33, 63, 64, 65, 127, 128, 129, 255, 256, 257];

		for (const size of sizes) {
			const data = TestUtils.generateTestData(size);

			const compressed = await TestUtils.compressData(data, "deflate");
			TestUtils.assert(compressed.length > 0, `Size ${size} compression should work`);

			const decompressed = await TestUtils.decompressData(compressed, "deflate");
			TestUtils.assertArraysEqual(decompressed, data, `Size ${size} should decompress correctly`);
		}
	});

	await TestUtils.test("Power-of-two sizes", async () => {
		const sizes = [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048];

		for (const size of sizes) {
			const data = TestUtils.generateTestData(size);

			const compressed = await TestUtils.compressData(data, "deflate");
			TestUtils.assert(compressed.length > 0, `Power-of-two size ${size} compression should work`);

			const decompressed = await TestUtils.decompressData(compressed, "deflate");
			TestUtils.assertArraysEqual(decompressed, data, `Power-of-two size ${size} should decompress correctly`);
		}
	});

	TestUtils.printSummary();
}

if (import.meta.main) {
	await runEdgeCasesTests();
}
