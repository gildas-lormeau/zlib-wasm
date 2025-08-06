/**
 * Web Worker for testing CompressionStream/DecompressionStream APIs
 * This worker performs compression/decompression operations and reports results back
 */

// Helper function to convert array to Uint8Array
function convertToUint8Array(data) {
	if (data instanceof Uint8Array) return data;
	return new Uint8Array(data);
}

// Helper function to compress data
async function compressData(data, format = "deflate") {
	const { CompressionStream } = await import("../src/index.js");
	const compressionStream = new CompressionStream(format);

	const writer = compressionStream.writable.getWriter();
	const reader = compressionStream.readable.getReader();

	// Start reading chunks
	const chunks = [];
	const readPromise = (async () => {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
	})();

	// Write data and close
	await writer.write(convertToUint8Array(data));
	await writer.close();

	// Wait for all chunks to be read
	await readPromise;

	// Combine chunks
	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result;
}

// Helper function to decompress data
async function decompressData(compressedData, format = "deflate") {
	const { DecompressionStream } = await import("../src/index.js");
	const decompressionStream = new DecompressionStream(format);

	const writer = decompressionStream.writable.getWriter();
	const reader = decompressionStream.readable.getReader();

	// Start reading chunks
	const chunks = [];
	const readPromise = (async () => {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			chunks.push(value);
		}
	})();

	// Write data and close
	await writer.write(convertToUint8Array(compressedData));
	await writer.close();

	// Wait for all chunks to be read
	await readPromise;

	// Combine chunks
	const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.length;
	}

	return result;
}

// Message handler
self.onmessage = async function (event) {
	const { id, type, data } = event.data;

	try {
		switch (type) {
			case "init": {
				// Initialize the compression streams polyfill
				await import("../src/index.js");
				self.postMessage({ id, type: "init", success: true });
				break;
			}

			case "compress": {
				const { inputData, format } = data;
				const compressed = await compressData(inputData, format);
				self.postMessage({
					id,
					type: "compress",
					success: true,
					data: Array.from(compressed), // Convert to regular array for transfer
				});
				break;
			}

			case "decompress": {
				const { compressedData, format: decompressFormat } = data;
				const decompressed = await decompressData(compressedData, decompressFormat);
				self.postMessage({
					id,
					type: "decompress",
					success: true,
					data: Array.from(decompressed), // Convert to regular array for transfer
				});
				break;
			}

			case "round-trip": {
				// Test complete round trip in worker
				const { originalData, testFormat } = data;
				const compressedInWorker = await compressData(originalData, testFormat);
				const decompressedInWorker = await decompressData(compressedInWorker, testFormat);

				// Verify data integrity
				const originalArray = convertToUint8Array(originalData);
				const matches = originalArray.length === decompressedInWorker.length &&
					originalArray.every((byte, index) => byte === decompressedInWorker[index]);

				self.postMessage({
					id,
					type: "round-trip",
					success: true,
					data: {
						originalSize: originalArray.length,
						compressedSize: compressedInWorker.length,
						decompressedSize: decompressedInWorker.length,
						dataMatches: matches,
						compressionRatio: (compressedInWorker.length / originalArray.length * 100).toFixed(2),
					},
				});
				break;
			}

			default: {
				throw new Error(`Unknown message type: ${type}`);
			}
		}
	} catch (error) {
		self.postMessage({
			id,
			type: type,
			success: false,
			error: error.message,
		});
	}
};
