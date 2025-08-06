#!/usr/bin/env deno run --allow-read --allow-net

import { TestUtils } from "./test-utils.js";

async function runStreamingFunctionalityTests() {
	console.log("Streaming Functionality Tests");

	await TestUtils.test("Multiple chunk compression", async () => {
		const { CompressionStream } = await TestUtils.importCompressionStreams();
		const compressionStream = new CompressionStream("deflate");

		const chunks = [
			TestUtils.stringToUint8Array("First chunk. "),
			TestUtils.stringToUint8Array("Second chunk. "),
			TestUtils.stringToUint8Array("Third chunk."),
		];

		const writer = compressionStream.writable.getWriter();
		const readerPromise = TestUtils.streamToUint8Array(compressionStream.readable);

		// Write chunks one by one
		for (const chunk of chunks) {
			await writer.write(chunk);
		}
		await writer.close();

		const compressed = await readerPromise;
		TestUtils.assert(compressed.length > 0, "Multi-chunk compression should produce output");

		// Verify decompression
		const originalData = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.length, 0));
		let offset = 0;
		for (const chunk of chunks) {
			originalData.set(chunk, offset);
			offset += chunk.length;
		}

		const decompressed = await TestUtils.decompressData(compressed, "deflate");
		TestUtils.assertArraysEqual(decompressed, originalData, "Multi-chunk decompression should match original");
	});

	await TestUtils.test("Multiple chunk decompression", async () => {
		const originalData = TestUtils.stringToUint8Array("This is test data for chunk decompression.");
		const compressed = await TestUtils.compressData(originalData, "deflate");

		const { DecompressionStream } = await TestUtils.importCompressionStreams();
		const decompressionStream = new DecompressionStream("deflate");

		const writer = decompressionStream.writable.getWriter();
		const readerPromise = TestUtils.streamToUint8Array(decompressionStream.readable);

		// Split compressed data into chunks
		const chunkSize = Math.ceil(compressed.length / 3);
		for (let i = 0; i < compressed.length; i += chunkSize) {
			const chunk = compressed.slice(i, i + chunkSize);
			await writer.write(chunk);
		}
		await writer.close();

		const decompressed = await readerPromise;
		TestUtils.assertArraysEqual(decompressed, originalData, "Multi-chunk decompression should match original");
	});

	await TestUtils.test("Stream interface verification", async () => {
		const { CompressionStream, DecompressionStream } = await TestUtils.importCompressionStreams();

		const compressionStream = new CompressionStream("deflate");
		const decompressionStream = new DecompressionStream("deflate");

		// Check required properties
		TestUtils.assert("readable" in compressionStream, "CompressionStream should have readable property");
		TestUtils.assert("writable" in compressionStream, "CompressionStream should have writable property");
		TestUtils.assert("readable" in decompressionStream, "DecompressionStream should have readable property");
		TestUtils.assert("writable" in decompressionStream, "DecompressionStream should have writable property");

		// Check stream types
		TestUtils.assert(compressionStream.readable instanceof ReadableStream, "readable should be ReadableStream");
		TestUtils.assert(compressionStream.writable instanceof WritableStream, "writable should be WritableStream");
	});

	await TestUtils.test("Transform stream pipeline", async () => {
		const { CompressionStream, DecompressionStream } = await TestUtils.importCompressionStreams();

		const originalData = TestUtils.stringToUint8Array("Pipeline test data. ".repeat(20));

		// Create a pipeline: source -> compression -> decompression -> sink
		const compressionStream = new CompressionStream("deflate");
		const decompressionStream = new DecompressionStream("deflate");

		// Create readable stream from original data
		const sourceStream = new ReadableStream({
			start(controller) {
				// Send data in chunks
				const chunkSize = 20;
				for (let i = 0; i < originalData.length; i += chunkSize) {
					const chunk = originalData.slice(i, i + chunkSize);
					controller.enqueue(chunk);
				}
				controller.close();
			},
		});

		// Pipeline the streams
		const resultStream = sourceStream
			.pipeThrough(compressionStream)
			.pipeThrough(decompressionStream);

		const result = await TestUtils.streamToUint8Array(resultStream);
		TestUtils.assertArraysEqual(result, originalData, "Pipeline result should match original");
	});

	TestUtils.printSummary();
}

if (import.meta.main) {
	await runStreamingFunctionalityTests();
}
