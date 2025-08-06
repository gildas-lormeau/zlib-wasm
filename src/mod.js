/**
 * CompressionStream & DecompressionStream Polyfill
 */

const Z_NO_FLUSH = 0;
const Z_PARTIAL_FLUSH = 1;
const Z_SYNC_FLUSH = 2;
const Z_FULL_FLUSH = 3;
const Z_FINISH = 4;
const Z_OK = 0;
const Z_STREAM_END = 1;
const Z_DEFAULT_COMPRESSION = -1;
const FLUSH_MODES = {
	none: Z_NO_FLUSH,
	partial: Z_PARTIAL_FLUSH,
	sync: Z_SYNC_FLUSH,
	full: Z_FULL_FLUSH,
	finish: Z_FINISH,
	auto: Z_NO_FLUSH,
};

let zlibModule;

async function initModule(moduleCode, wasmBinary) {
	const moduleFunction = new Function([], `${moduleCode};return ZlibModule`);
	const ZlibModuleFactory = moduleFunction([]);
	zlibModule = await ZlibModuleFactory({ wasmBinary });
	return zlibModule;
}

class ZlibCompressor {
	constructor(level = Z_DEFAULT_COMPRESSION, format = "deflate") {
		this.level = level;
		this.format = format;
		this.streamPtr = null;
		this.inputPtr = null;
		this.outputPtr = null;
		this.inputSize = 32768;
		this.outputSize = 32768;
		this.initialized = false;
	}

	initialize() {
		if (this.initialized) return;
		this.streamPtr = zlibModule._malloc(56);
		this.inputPtr = zlibModule._malloc(this.inputSize);
		this.outputPtr = zlibModule._malloc(this.outputSize);
		initStream(zlibModule, this.streamPtr);
		const result = zlibModule.ccall("deflateInit2_", "number", [
			"number",
			"number",
			"number",
			"number",
			"number",
			"number",
			"string",
			"number",
		], [this.streamPtr, this.level, 8, getWindowBits(this.format), 8, 0, "1.3.1.1-motley", 56]);
		if (result !== 0) {
			throw new Error(`Compression initialization failed: ${result}`);
		}
		this.initialized = true;
	}

	async compress(data, finish = false, flushMode = "auto") {
		if (!this.initialized) {
			await this.initialize();
		}
		if (data.length === 0 && !finish) {
			return new Uint8Array(0);
		}

		// Handle large data by chunking
		if (data.length > this.inputSize) {
			const results = [];
			let offset = 0;

			// Process data in chunks
			while (offset < data.length) {
				const chunkSize = Math.min(this.inputSize, data.length - offset);
				const chunk = data.slice(offset, offset + chunkSize);
				const isLastChunk = offset + chunkSize >= data.length;

				// Only finish on the last chunk if finish is requested
				const chunkResult = await this.compressSingleChunk(chunk, finish && isLastChunk, flushMode);
				if (chunkResult.length > 0) {
					results.push(chunkResult);
				}

				offset += chunkSize;
			}

			// Combine all results
			const totalLength = results.reduce((sum, chunk) => sum + chunk.length, 0);
			const combined = new Uint8Array(totalLength);
			let combinedOffset = 0;
			for (const result of results) {
				combined.set(result, combinedOffset);
				combinedOffset += result.length;
			}
			return combined;
		}

		// For small data, use original logic
		return this.compressSingleChunk(data, finish, flushMode);
	}

	compressSingleChunk(data, finish = false, flushMode = "auto") {
		if (data.length > this.inputSize) {
			throw new Error(`Chunk size ${data.length} exceeds buffer size ${this.inputSize}`);
		}

		copyToWasmMemory(zlibModule, data, this.inputPtr);
		zlibModule.setValue(this.streamPtr + 0, this.inputPtr, "i32");
		zlibModule.setValue(this.streamPtr + 4, data.length, "i32");
		zlibModule.setValue(this.streamPtr + 12, this.outputPtr, "i32");
		zlibModule.setValue(this.streamPtr + 16, this.outputSize, "i32");
		const flushType = finish ? Z_FINISH : (FLUSH_MODES[flushMode] || Z_NO_FLUSH);
		const result = zlibModule._deflate(this.streamPtr, flushType);
		if (result < 0 || (finish && result !== Z_STREAM_END) || (!finish && result !== Z_OK)) {
			throw new Error(`Compression failed: ${result}`);
		}
		const availOut = zlibModule.getValue(this.streamPtr + 16, "i32");
		const outputLength = this.outputSize - availOut;
		return copyFromWasmMemory(zlibModule, this.outputPtr, outputLength);
	}

	async finish() {
		const finalData = await this.compress(new Uint8Array(0), true);
		this.cleanup();
		return finalData;
	}

	cleanup() {
		if (zlibModule && this.streamPtr) {
			zlibModule._deflateEnd(this.streamPtr);
			zlibModule._free(this.streamPtr);
			zlibModule._free(this.inputPtr);
			zlibModule._free(this.outputPtr);
			this.streamPtr = null;
			this.inputPtr = null;
			this.outputPtr = null;
		}
		this.initialized = false;
	}
}

class ZlibDecompressor {
	constructor(format = "deflate") {
		this.format = format;
		this.streamPtr = null;
		this.inputPtr = null;
		this.outputPtr = null;
		this.windowPtr = null;
		this.inputSize = 32768;
		this.outputSize = 32768;
		this.initialized = false;
		this.isDeflate64 = format === "deflate64" || format === "deflate64-raw";
	}

	initialize() {
		if (this.initialized) return;
		this.streamPtr = zlibModule._malloc(56);
		this.inputPtr = zlibModule._malloc(this.inputSize);
		this.outputPtr = zlibModule._malloc(this.outputSize);
		initStream(zlibModule, this.streamPtr);
		let result;
		if (this.isDeflate64) {
			this.windowPtr = zlibModule._malloc(65536);
			result = zlibModule.ccall("inflateBack9Init_", "number", ["number", "number", "string", "number"], [
				this.streamPtr,
				this.windowPtr,
				"1.3.1.1-motley",
				56,
			]);
		} else {
			result = zlibModule.ccall("inflateInit2_", "number", ["number", "number", "string", "number"], [
				this.streamPtr,
				getWindowBits(this.format),
				"1.3.1.1-motley",
				56,
			]);
		}
		if (result !== 0) {
			throw new Error(`Decompression initialization failed: ${result}`);
		}
		this.initialized = true;
	}

	async decompress(data, finish = false, flushMode = "auto") {
		if (!this.initialized) {
			await this.initialize();
		}
		if (data.length === 0 && !finish) {
			return new Uint8Array(0);
		}
		if (this.isDeflate64) {
			return this.decompressDeflate64(data, finish);
		}
		const results = [];
		let totalInputProcessed = 0;
		while (totalInputProcessed < data.length || finish) {
			const remainingInput = data.length - totalInputProcessed;
			const inputChunkSize = Math.min(remainingInput, this.inputSize);
			if (inputChunkSize > 0) {
				copyToWasmMemory(
					zlibModule,
					data.subarray(totalInputProcessed, totalInputProcessed + inputChunkSize),
					this.inputPtr,
				);
			}
			zlibModule.setValue(this.streamPtr + 0, this.inputPtr, "i32");
			zlibModule.setValue(this.streamPtr + 4, inputChunkSize, "i32");
			zlibModule.setValue(this.streamPtr + 12, this.outputPtr, "i32");
			zlibModule.setValue(this.streamPtr + 16, this.outputSize, "i32");
			const isLastChunk = totalInputProcessed + inputChunkSize >= data.length;
			const flushType = (finish && isLastChunk) ? Z_FINISH : (FLUSH_MODES[flushMode] || Z_SYNC_FLUSH);
			const result = zlibModule._inflate(this.streamPtr, flushType);
			if (result < 0 && result !== -5) {
				throw new Error(`Decompression failed: ${result}`);
			}
			const availOut = zlibModule.getValue(this.streamPtr + 16, "i32");
			const outputLength = this.outputSize - availOut;
			if (outputLength > 0) {
				results.push(copyFromWasmMemory(zlibModule, this.outputPtr, outputLength));
			}
			const inputProcessed = zlibModule.getValue(this.streamPtr + 4, "i32");
			totalInputProcessed += inputChunkSize - inputProcessed;
			if (result === Z_STREAM_END) {
				break;
			}
			if (finish && isLastChunk && result !== Z_STREAM_END) {
				continue;
			}
			if (totalInputProcessed < data.length) {
				continue;
			}
			break;
		}

		const totalLength = results.reduce((sum, chunk) => sum + chunk.length, 0);
		const output = new Uint8Array(totalLength);
		let offset = 0;
		for (const chunk of results) {
			output.set(chunk, offset);
			offset += chunk.length;
		}
		return output;
	}

	decompressDeflate64(data, finish) {
		copyToWasmMemory(zlibModule, data, this.inputPtr);
		zlibModule.setValue(this.streamPtr + 0, this.inputPtr, "i32");
		zlibModule.setValue(this.streamPtr + 4, data.length, "i32");
		zlibModule.setValue(this.streamPtr + 8, this.outputPtr, "i32");
		zlibModule.setValue(this.streamPtr + 12, this.outputSize, "i32");
		if (!this.inflateBack9InFunc) {
			this.inflateBack9InFunc = zlibModule.addFunction((_, buf) => {
				const availIn = zlibModule.getValue(this.streamPtr + 4, "i32");
				if (availIn > 0) {
					const nextIn = zlibModule.getValue(this.streamPtr + 0, "i32");
					zlibModule.setValue(buf, nextIn, "i32");
					return availIn;
				}
				return 0;
			}, "iii");
			this.inflateBack9OutFunc = zlibModule.addFunction((_, buf, len) => {
				const nextOut = zlibModule.getValue(this.streamPtr + 8, "i32");
				const availOut = zlibModule.getValue(this.streamPtr + 12, "i32");
				const copyLen = Math.min(len, availOut);
				for (let i = 0; i < copyLen; i++) {
					const value = zlibModule.getValue(buf + i, "i8");
					zlibModule.setValue(nextOut + i, value, "i8");
				}
				zlibModule.setValue(this.streamPtr + 8, nextOut + copyLen, "i32");
				zlibModule.setValue(this.streamPtr + 12, availOut - copyLen, "i32");

				return 0;
			}, "iiii");
		}
		const result = zlibModule.ccall("inflateBack9", "number", ["number", "number", "number", "number", "number"], [
			this.streamPtr,
			this.inflateBack9InFunc,
			0,
			this.inflateBack9OutFunc,
			0,
		]);
		if (finish ? result !== 1 : (result !== 0 && result !== 1)) {
			const msg = finish ? "expected end of stream but got error code" : "failed with error code";
			throw new Error(`Deflate64 decompression ${finish ? "incomplete: " + msg : msg}: ${result}`);
		}
		const outputLength = zlibModule.getValue(this.streamPtr + 8, "i32") - this.outputPtr;
		return copyFromWasmMemory(zlibModule, this.outputPtr, outputLength);
	}

	async finish() {
		const finalData = await this.decompress(new Uint8Array(0), true);
		this.cleanup();
		return finalData;
	}

	cleanup() {
		if (zlibModule && this.streamPtr) {
			if (this.isDeflate64) {
				zlibModule._inflateBack9End(this.streamPtr);
				if (this.windowPtr) {
					zlibModule._free(this.windowPtr);
					this.windowPtr = null;
				}
				if (this.inflateBack9InFunc) {
					zlibModule.removeFunction(this.inflateBack9InFunc);
					this.inflateBack9InFunc = null;
				}
				if (this.inflateBack9OutFunc) {
					zlibModule.removeFunction(this.inflateBack9OutFunc);
					this.inflateBack9OutFunc = null;
				}
			} else {
				zlibModule._inflateEnd(this.streamPtr);
			}
			zlibModule._free(this.streamPtr);
			zlibModule._free(this.inputPtr);
			zlibModule._free(this.outputPtr);
			this.streamPtr = null;
			this.inputPtr = null;
			this.outputPtr = null;
		}
		this.initialized = false;
	}
}

class BaseStreamPolyfill {
	constructor(format, processorClass, methodName, processorArgs = []) {
		this.format = format;
		this.createTransformStream(processorClass, methodName, processorArgs);
	}

	createTransformStream(ProcessorClass, methodName, processorArgs) {
		let processor;
		const transformStream = new TransformStream({
			start: async () => {
				processor = new ProcessorClass(...processorArgs, this.format);
				await processor.initialize();
			},
			transform: async (chunk, controller) => {
				const data = convertChunkToUint8Array(chunk);
				const result = await processor[methodName](data, false);
				if (result.length > 0) {
					controller.enqueue(result);
				}
			},
			flush: async (controller) => {
				try {
					const finalData = await processor.finish();
					if (finalData.length > 0) {
						controller.enqueue(finalData);
					}
				} finally {
					processor.cleanup();
				}
			},
		});
		this._readable = transformStream.readable;
		this._writable = transformStream.writable;
	}

	get readable() {
		return this._readable;
	}
	set readable(value) {
		this._readable = value;
	}
	get writable() {
		return this._writable;
	}
	set writable(value) {
		this._writable = value;
	}
}

class CompressionStream extends BaseStreamPolyfill {
	constructor(format, options = {}) {
		const level = options.level !== undefined ? options.level : 6;
		super(format, ZlibCompressor, "compress", [level]);
	}
}

class DecompressionStream extends BaseStreamPolyfill {
	constructor(format) {
		super(format, ZlibDecompressor, "decompress");
	}
}

export { CompressionStream, DecompressionStream, initModule };

function getWindowBits(format) {
	switch (format) {
		case "deflate":
			return 15;
		case "deflate-raw":
			return -15;
		case "gzip":
			return 31;
		default:
			throw new Error(`Unsupported format: ${format}`);
	}
}

function copyToWasmMemory(zlibModule, sourceData, targetPtr) {
	for (let i = 0; i < sourceData.length; i++) {
		zlibModule.setValue(targetPtr + i, sourceData[i], "i8");
	}
}

function copyFromWasmMemory(zlibModule, sourcePtr, length) {
	const output = new Uint8Array(length);
	for (let i = 0; i < length; i++) {
		output[i] = zlibModule.getValue(sourcePtr + i, "i8") & 0xFF;
	}
	return output;
}

function initStream(zlibModule, streamPtr) {
	for (let i = 0; i < 56; i++) {
		zlibModule.setValue(streamPtr + i, 0, "i8");
	}
}

function convertChunkToUint8Array(chunk) {
	if (chunk instanceof ArrayBuffer) {
		return new Uint8Array(chunk);
	} else if (chunk instanceof Uint8Array) {
		return chunk;
	} else if (ArrayBuffer.isView(chunk)) {
		return new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength);
	}
}
