#!/usr/bin/env deno run --allow-read --allow-net

import { TestUtils } from "./test-utils.js";

async function runPerformanceTests() {
	console.log("⚡ Performance Tests");

	await TestUtils.test("Compression ratio for repetitive data", async () => {
		const repetitiveData = new Uint8Array(10000);
		repetitiveData.fill(65); // All 'A' characters

		const compressed = await TestUtils.compressData(repetitiveData, "deflate");

		const compressionRatio = compressed.length / repetitiveData.length;
		console.log(`   Repetitive data compression ratio: ${(compressionRatio * 100).toFixed(2)}%`);

		TestUtils.assert(compressionRatio < 0.1, "Repetitive data should compress to less than 10% of original size");

		// Verify decompression
		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, repetitiveData, "Decompressed data should match original");
	});

	await TestUtils.test("Compression ratio for random data", async () => {
		const randomData = TestUtils.generateRandomData(10000);

		const compressed = await TestUtils.compressData(randomData, "deflate");

		const compressionRatio = compressed.length / randomData.length;
		console.log(`   Random data compression ratio: ${(compressionRatio * 100).toFixed(2)}%`);

		TestUtils.assert(compressionRatio > 0.9, "Random data should not compress much (>90% of original)");

		// Verify decompression
		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, randomData, "Decompressed data should match original");
	});

	await TestUtils.test("Compression ratio for text data", async () => {
		const textData = TestUtils.stringToUint8Array(
			"The quick brown fox jumps over the lazy dog. ".repeat(200),
		);

		const compressed = await TestUtils.compressData(textData, "deflate");

		const compressionRatio = compressed.length / textData.length;
		console.log(`   Text data compression ratio: ${(compressionRatio * 100).toFixed(2)}%`);

		TestUtils.assert(compressionRatio < 0.3, "Repetitive text should compress to less than 30% of original size");

		// Verify decompression
		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, textData, "Decompressed data should match original");
	});

	await TestUtils.test("Different compression levels performance", async () => {
		const { CompressionStream } = await TestUtils.importCompressionStreams();
		const testData = TestUtils.stringToUint8Array("Performance test data. ".repeat(500));

		const levels = [1, 6, 9]; // Fast, default, best compression
		const results = [];

		for (const level of levels) {
			const startTime = performance.now();

			const stream = new CompressionStream("deflate", { level });
			const writer = stream.writable.getWriter();
			const readerPromise = TestUtils.streamToUint8Array(stream.readable);

			await writer.write(testData);
			await writer.close();

			const compressed = await readerPromise;
			const endTime = performance.now();

			const compressionTime = endTime - startTime;
			const compressionRatio = compressed.length / testData.length;

			results.push({ level, time: compressionTime, ratio: compressionRatio, size: compressed.length });

			console.log(
				`   Level ${level}: ${compressionTime.toFixed(2)}ms, ratio: ${(compressionRatio * 100).toFixed(2)
				}%, size: ${compressed.length}`,
			);
		}

		// Verify all levels produce valid compressed data
		for (const result of results) {
			TestUtils.assert(result.size > 0, `Level ${result.level} should produce output`);
			TestUtils.assert(result.ratio < 1.0, `Level ${result.level} should compress data`);
		}

		// Generally, higher compression levels should produce smaller output
		TestUtils.assert(results[2].ratio <= results[0].ratio, "Level 9 should compress better than level 1");
	});

	await TestUtils.test("Large data throughput", async () => {
		const largeData = TestUtils.generateTestData(100000); // Back to original 100KB

		const startTime = performance.now();
		const compressed = await TestUtils.compressData(largeData, "deflate");
		const compressionTime = performance.now() - startTime;

		const decompressStartTime = performance.now();
		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		const decompressionTime = performance.now() - decompressStartTime;

		console.log(
			`   Compression: ${compressionTime.toFixed(2)}ms (${(largeData.length / compressionTime / 1000).toFixed(2)
			} MB/s)`,
		);
		console.log(
			`   Decompression: ${decompressionTime.toFixed(2)}ms (${(decompressed.length / decompressionTime / 1000).toFixed(2)
			} MB/s)`,
		);

		TestUtils.assert(compressionTime < 5000, "Compression should complete within 5 seconds");
		TestUtils.assert(decompressionTime < 5000, "Decompression should complete within 5 seconds");
		TestUtils.assertEqual(decompressed.length, largeData.length, "Decompressed length should match original");

		// Full integrity check now that the bug is fixed
		TestUtils.assertArraysEqual(decompressed, largeData, "Large data should decompress correctly");
	});

	TestUtils.printSummary();
}

if (import.meta.main) {
	await runPerformanceTests();
}
