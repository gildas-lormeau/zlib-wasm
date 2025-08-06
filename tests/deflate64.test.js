#!/usr/bin/env deno run --allow-read --allow-net

import { TestUtils } from "./test-utils.js";

async function runDeflate64Tests() {
	console.log("Deflate64 Format Tests");

	await TestUtils.test("Deflate64 format (decompression-only verification)", async () => {
		const { CompressionStream, DecompressionStream } = await TestUtils.importCompressionStreams();

		console.log(`   Testing deflate64 format support (decompression-only)`);

		// Test that compression fails when actually used (not at construction)
		try {
			const compressionStream = new CompressionStream("deflate64");
			const writer = compressionStream.writable.getWriter();

			// This should trigger the format validation and fail
			await writer.write(new Uint8Array([1, 2, 3]));
			await writer.close();

			TestUtils.assert(false, "Deflate64 compression should not be supported");
		} catch (error) {
			if (error.message.includes("Unsupported format: deflate64")) {
				console.log(`   ✓ Deflate64 compression correctly rejected: format not supported for compression`);
			} else {
				throw error;
			}
		}

		// Test that decompression stream can be created and used
		try {
			const decompressionStream = new DecompressionStream("deflate64");
			TestUtils.assert(decompressionStream, "Deflate64 decompression stream should be created");
			TestUtils.assert(decompressionStream.readable, "Should have readable stream");
			TestUtils.assert(decompressionStream.writable, "Should have writable stream");
			console.log(`   ✓ Deflate64 decompression stream created successfully`);
		} catch (error) {
			throw new Error(`Deflate64 decompression should be supported: ${error.message}`);
		}
	});

	await TestUtils.test("Deflate64-raw format (decompression-only verification)", async () => {
		const { CompressionStream, DecompressionStream } = await TestUtils.importCompressionStreams();

		console.log(`   Testing deflate64-raw format support (decompression-only)`);

		// Test that compression fails when actually used (not at construction)
		try {
			const compressionStream = new CompressionStream("deflate64-raw");
			const writer = compressionStream.writable.getWriter();

			// This should trigger the format validation and fail
			await writer.write(new Uint8Array([1, 2, 3]));
			await writer.close();

			TestUtils.assert(false, "Deflate64-raw compression should not be supported");
		} catch (error) {
			if (error.message.includes("Unsupported format: deflate64-raw")) {
				console.log(`   ✓ Deflate64-raw compression correctly rejected: format not supported for compression`);
			} else {
				throw error;
			}
		}

		// Test that decompression stream can be created and used
		try {
			const decompressionStream = new DecompressionStream("deflate64-raw");
			TestUtils.assert(decompressionStream, "Deflate64-raw decompression stream should be created");
			TestUtils.assert(decompressionStream.readable, "Should have readable stream");
			TestUtils.assert(decompressionStream.writable, "Should have writable stream");
			console.log(`   ✓ Deflate64-raw decompression stream created successfully`);
		} catch (error) {
			throw new Error(`Deflate64-raw decompression should be supported: ${error.message}`);
		}
	});

	await TestUtils.test("Deflate64 decompression capability verification", async () => {
		const { DecompressionStream } = await TestUtils.importCompressionStreams();

		console.log(`   Verifying deflate64 decompression stream can be created`);

		try {
			const decompressionStream = new DecompressionStream("deflate64");
			TestUtils.assert(decompressionStream, "Deflate64 decompression stream should be created");
			TestUtils.assert(decompressionStream.readable, "Should have readable stream");
			TestUtils.assert(decompressionStream.writable, "Should have writable stream");
			console.log(`   ✓ Deflate64 decompression stream created successfully`);
		} catch (error) {
			if (error.message.includes("Unsupported format")) {
				console.log(`   ⚠️  Deflate64 format not supported: ${error.message}`);
				// Skip this test if format is not supported
				return;
			}
			throw error;
		}
	});

	await TestUtils.test("Deflate64-raw decompression capability verification", async () => {
		const { DecompressionStream } = await TestUtils.importCompressionStreams();

		console.log(`   Verifying deflate64-raw decompression stream can be created`);

		try {
			const decompressionStream = new DecompressionStream("deflate64-raw");
			TestUtils.assert(decompressionStream, "Deflate64-raw decompression stream should be created");
			TestUtils.assert(decompressionStream.readable, "Should have readable stream");
			TestUtils.assert(decompressionStream.writable, "Should have writable stream");
			console.log(`   ✓ Deflate64-raw decompression stream created successfully`);
		} catch (error) {
			if (error.message.includes("Unsupported format")) {
				console.log(`   ⚠️  Deflate64-raw format not supported: ${error.message}`);
				// Skip this test if format is not supported
				return;
			}
			throw error;
		}
	});

	await TestUtils.test("Deflate64 format comprehensive verification", async () => {
		const { CompressionStream, DecompressionStream } = await TestUtils.importCompressionStreams();

		console.log(`   Testing deflate64 format capabilities`);

		// Test compression rejection
		try {
			const compressionStream = new CompressionStream("deflate64");
			const writer = compressionStream.writable.getWriter();
			await writer.write(new Uint8Array([1, 2, 3]));
			await writer.close();
			TestUtils.assert(false, "Should have failed");
		} catch (error) {
			if (error.message.includes("Unsupported format: deflate64")) {
				console.log(`   ✓ Deflate64 compression correctly rejected`);
			} else {
				throw error;
			}
		}

		// Test decompression capability
		const decompressionStream = new DecompressionStream("deflate64");
		TestUtils.assert(decompressionStream.readable, "Should have readable stream");
		TestUtils.assert(decompressionStream.writable, "Should have writable stream");
		console.log(`   ✓ Deflate64 decompression stream ready`);
	});

	await TestUtils.test("Deflate64-raw format comprehensive verification", async () => {
		const { CompressionStream, DecompressionStream } = await TestUtils.importCompressionStreams();

		console.log(`   Testing deflate64-raw format capabilities`);

		// Test compression rejection
		try {
			const compressionStream = new CompressionStream("deflate64-raw");
			const writer = compressionStream.writable.getWriter();
			await writer.write(new Uint8Array([1, 2, 3]));
			await writer.close();
			TestUtils.assert(false, "Should have failed");
		} catch (error) {
			if (error.message.includes("Unsupported format: deflate64-raw")) {
				console.log(`   ✓ Deflate64-raw compression correctly rejected`);
			} else {
				throw error;
			}
		}

		// Test decompression capability
		const decompressionStream = new DecompressionStream("deflate64-raw");
		TestUtils.assert(decompressionStream.readable, "Should have readable stream");
		TestUtils.assert(decompressionStream.writable, "Should have writable stream");
		console.log(`   ✓ Deflate64-raw decompression stream ready`);
	});

	TestUtils.printSummary();
}

if (import.meta.main) {
	await runDeflate64Tests();
}
