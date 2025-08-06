export class TestUtils {
	static testCount = 0;
	static passedCount = 0;
	static failedCount = 0;

	static async test(name, testFn) {
		this.testCount++;
		console.log(`\nTest: ${name}`);
		try {
			await testFn();
			this.passedCount++;
			console.log(`✓ PASSED: ${name}`);
			return true;
		} catch (error) {
			this.failedCount++;
			console.log(`❌ FAILED: ${name}`);
			console.log(`   Error: ${error.message}`);
			if (error.stack) {
				console.log(`   Stack: ${error.stack.split("\n").slice(0, 3).join("\n")}`);
			}
			return false;
		}
	}

	static async importCompressionStreams() {
		try {
			return await import("../src/index.js");
		} catch (error) {
			throw new Error(`Failed to load compression streams library: ${error.message}`);
		}
	}

	static assert(condition, message = "Assertion failed") {
		if (!condition) {
			throw new Error(message);
		}
	}

	static assertEqual(actual, expected, message = "Values are not equal") {
		if (actual !== expected) {
			throw new Error(`${message}. Expected: ${expected}, Actual: ${actual}`);
		}
	}

	static assertArraysEqual(actual, expected, message = "Arrays are not equal") {
		if (actual.length !== expected.length) {
			throw new Error(`${message}. Length mismatch - Expected: ${expected.length}, Actual: ${actual.length}`);
		}
		for (let i = 0; i < actual.length; i++) {
			if (actual[i] !== expected[i]) {
				throw new Error(
					`${message}. Difference at index ${i} - Expected: ${expected[i]}, Actual: ${actual[i]}`,
				);
			}
		}
	}

	static async streamToUint8Array(stream) {
		// Use the safer Response pattern which properly handles stream errors
		const response = new Response(stream);
		const arrayBuffer = await response.arrayBuffer();
		return new Uint8Array(arrayBuffer);
	}

	static async compressData(data, format = "deflate", options = {}) {
		const { CompressionStream } = await this.importCompressionStreams();
		const compressionStream = new CompressionStream(format, options);

		// Use safer pipeline pattern
		return this.streamToUint8Array(
			new ReadableStream({
				start(controller) {
					controller.enqueue(data);
					controller.close();
				},
			}).pipeThrough(compressionStream),
		);
	}

	static async decompressData(compressedData, format = "deflate") {
		const { DecompressionStream } = await this.importCompressionStreams();
		const decompressionStream = new DecompressionStream(format);

		// Use safer pipeline pattern
		return this.streamToUint8Array(
			new ReadableStream({
				start(controller) {
					controller.enqueue(compressedData);
					controller.close();
				},
			}).pipeThrough(decompressionStream),
		);
	}

	static generateTestData(size) {
		const data = new Uint8Array(size);
		for (let i = 0; i < size; i++) {
			data[i] = i % 256;
		}
		return data;
	}

	static generateRandomData(size) {
		const data = new Uint8Array(size);
		crypto.getRandomValues(data);
		return data;
	}

	static stringToUint8Array(str) {
		return new TextEncoder().encode(str);
	}

	static uint8ArrayToString(arr) {
		return new TextDecoder().decode(arr);
	}

	static printSummary() {
		console.log(`\nSummary: ${this.passedCount}/${this.testCount} tests passed`);
		if (this.failedCount > 0) {
			console.log(`❌ ${this.failedCount} tests failed`);
			Deno.exit(1);
		} else {
			console.log("✓ All tests passed!");
		}
	}
}
