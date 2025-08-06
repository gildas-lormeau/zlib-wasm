// deno-lint-ignore-file no-this-alias
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
		const zlibCompressor = this;
		zlibCompressor.level = level;
		zlibCompressor.format = format;
		zlibCompressor.streamPtr = null;
		zlibCompressor.inputPtr = null;
		zlibCompressor.outputPtr = null;
		zlibCompressor.inputSize = 32768;
		zlibCompressor.outputSize = 32768;
		zlibCompressor.initialized = false;
	}

	initialize() {
		const zlibCompressor = this;
		if (zlibCompressor.initialized) return;
		zlibCompressor.streamPtr = zlibModule._malloc(56);
		zlibCompressor.inputPtr = zlibModule._malloc(zlibCompressor.inputSize);
		zlibCompressor.outputPtr = zlibModule._malloc(zlibCompressor.outputSize);
		initStream(zlibModule, zlibCompressor.streamPtr);
		const result = zlibModule.ccall("deflateInit2_", "number", [
			"number",
			"number",
			"number",
			"number",
			"number",
			"number",
			"string",
			"number",
		], [zlibCompressor.streamPtr, zlibCompressor.level, 8, getWindowBits(zlibCompressor.format), 8, 0, "1.3.1.1-motley", 56]);
		if (result !== 0) {
			throw new Error(`Compression initialization failed: ${result}`);
		}
		zlibCompressor.initialized = true;
	}

	async compress(data, finish = false, flushMode = "auto") {
		const zlibCompressor = this;
		if (!zlibCompressor.initialized) {
			await zlibCompressor.initialize();
		}
		if (data.length === 0 && !finish) {
			return new Uint8Array(0);
		}
		if (data.length > zlibCompressor.inputSize) {
			const results = [];
			let offset = 0;
			while (offset < data.length) {
				const chunkSize = Math.min(zlibCompressor.inputSize, data.length - offset);
				const chunk = data.slice(offset, offset + chunkSize);
				const isLastChunk = offset + chunkSize >= data.length;
				const chunkResult = await zlibCompressor.compressSingleChunk(chunk, finish && isLastChunk, flushMode);
				if (chunkResult.length > 0) {
					results.push(chunkResult);
				}

				offset += chunkSize;
			}
			const totalLength = results.reduce((sum, chunk) => sum + chunk.length, 0);
			const combined = new Uint8Array(totalLength);
			let combinedOffset = 0;
			for (const result of results) {
				combined.set(result, combinedOffset);
				combinedOffset += result.length;
			}
			return combined;
		}
		return zlibCompressor.compressSingleChunk(data, finish, flushMode);
	}

	compressSingleChunk(data, finish = false, flushMode = "auto") {
		const zlibCompressor = this;
		if (data.length > zlibCompressor.inputSize) {
			throw new Error(`Chunk size ${data.length} exceeds buffer size ${zlibCompressor.inputSize}`);
		}
		copyToWasmMemory(zlibModule, data, zlibCompressor.inputPtr);
		zlibModule.setValue(zlibCompressor.streamPtr + 0, zlibCompressor.inputPtr, "i32");
		zlibModule.setValue(zlibCompressor.streamPtr + 4, data.length, "i32");
		zlibModule.setValue(zlibCompressor.streamPtr + 12, zlibCompressor.outputPtr, "i32");
		zlibModule.setValue(zlibCompressor.streamPtr + 16, zlibCompressor.outputSize, "i32");
		const flushType = finish ? Z_FINISH : (FLUSH_MODES[flushMode] || Z_NO_FLUSH);
		const result = zlibModule._deflate(zlibCompressor.streamPtr, flushType);
		if (result < 0 || (finish && result !== Z_STREAM_END) || (!finish && result !== Z_OK)) {
			throw new Error(`Compression failed: ${result}`);
		}
		const availOut = zlibModule.getValue(zlibCompressor.streamPtr + 16, "i32");
		const outputLength = zlibCompressor.outputSize - availOut;
		return copyFromWasmMemory(zlibModule, zlibCompressor.outputPtr, outputLength);
	}

	async finish() {
		const zlibCompressor = this;
		const finalData = await zlibCompressor.compress(new Uint8Array(0), true);
		zlibCompressor.cleanup();
		return finalData;
	}

	cleanup() {
		const zlibCompressor = this;
		if (zlibModule && zlibCompressor.streamPtr) {
			zlibModule._deflateEnd(zlibCompressor.streamPtr);
			zlibModule._free(zlibCompressor.streamPtr);
			zlibModule._free(zlibCompressor.inputPtr);
			zlibModule._free(zlibCompressor.outputPtr);
			zlibCompressor.streamPtr = null;
			zlibCompressor.inputPtr = null;
			zlibCompressor.outputPtr = null;
		}
		zlibCompressor.initialized = false;
	}
}

class ZlibDecompressor {
	constructor(format = "deflate") {
		const zlibDecompressor = this;
		zlibDecompressor.format = format;
		zlibDecompressor.streamPtr = null;
		zlibDecompressor.inputPtr = null;
		zlibDecompressor.outputPtr = null;
		zlibDecompressor.windowPtr = null;
		zlibDecompressor.inputSize = 32768;
		zlibDecompressor.outputSize = 32768;
		zlibDecompressor.initialized = false;
		zlibDecompressor.isDeflate64 = format === "deflate64" || format === "deflate64-raw";
	}

	initialize() {
		const zlibDecompressor = this;
		if (zlibDecompressor.initialized) return;
		zlibDecompressor.streamPtr = zlibModule._malloc(56);
		zlibDecompressor.inputPtr = zlibModule._malloc(zlibDecompressor.inputSize);
		zlibDecompressor.outputPtr = zlibModule._malloc(zlibDecompressor.outputSize);
		initStream(zlibModule, zlibDecompressor.streamPtr);
		let result;
		if (zlibDecompressor.isDeflate64) {
			zlibDecompressor.windowPtr = zlibModule._malloc(65536);
			result = zlibModule.ccall("inflateBack9Init_", "number", ["number", "number", "string", "number"], [
				zlibDecompressor.streamPtr,
				zlibDecompressor.windowPtr,
				"1.3.1.1-motley",
				56,
			]);
		} else {
			result = zlibModule.ccall("inflateInit2_", "number", ["number", "number", "string", "number"], [
				zlibDecompressor.streamPtr,
				getWindowBits(zlibDecompressor.format),
				"1.3.1.1-motley",
				56,
			]);
		}
		if (result !== 0) {
			throw new Error(`Decompression initialization failed: ${result}`);
		}
		zlibDecompressor.initialized = true;
	}

	async decompress(data, finish = false, flushMode = "auto") {
		const zlibDecompressor = this;
		if (!zlibDecompressor.initialized) {
			await zlibDecompressor.initialize();
		}
		if (data.length === 0 && !finish) {
			return new Uint8Array(0);
		}
		if (zlibDecompressor.isDeflate64) {
			return zlibDecompressor.decompressDeflate64(data, finish);
		}
		const results = [];
		let totalInputProcessed = 0;
		while (totalInputProcessed < data.length || finish) {
			const remainingInput = data.length - totalInputProcessed;
			const inputChunkSize = Math.min(remainingInput, zlibDecompressor.inputSize);
			if (inputChunkSize > 0) {
				copyToWasmMemory(
					zlibModule,
					data.subarray(totalInputProcessed, totalInputProcessed + inputChunkSize),
					zlibDecompressor.inputPtr,
				);
			}
			zlibModule.setValue(zlibDecompressor.streamPtr + 0, zlibDecompressor.inputPtr, "i32");
			zlibModule.setValue(zlibDecompressor.streamPtr + 4, inputChunkSize, "i32");
			zlibModule.setValue(zlibDecompressor.streamPtr + 12, zlibDecompressor.outputPtr, "i32");
			zlibModule.setValue(zlibDecompressor.streamPtr + 16, zlibDecompressor.outputSize, "i32");
			const isLastChunk = totalInputProcessed + inputChunkSize >= data.length;
			const flushType = (finish && isLastChunk) ? Z_FINISH : (FLUSH_MODES[flushMode] || Z_SYNC_FLUSH);
			const result = zlibModule._inflate(zlibDecompressor.streamPtr, flushType);
			if (result < 0 && result !== -5) {
				throw new Error(`Decompression failed: ${result}`);
			}
			const availOut = zlibModule.getValue(zlibDecompressor.streamPtr + 16, "i32");
			const outputLength = zlibDecompressor.outputSize - availOut;
			if (outputLength > 0) {
				results.push(copyFromWasmMemory(zlibModule, zlibDecompressor.outputPtr, outputLength));
			}
			const inputProcessed = zlibModule.getValue(zlibDecompressor.streamPtr + 4, "i32");
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
		const zlibDecompressor = this;
		copyToWasmMemory(zlibModule, data, zlibDecompressor.inputPtr);
		zlibModule.setValue(zlibDecompressor.streamPtr + 0, zlibDecompressor.inputPtr, "i32");
		zlibModule.setValue(zlibDecompressor.streamPtr + 4, data.length, "i32");
		zlibModule.setValue(zlibDecompressor.streamPtr + 8, zlibDecompressor.outputPtr, "i32");
		zlibModule.setValue(zlibDecompressor.streamPtr + 12, zlibDecompressor.outputSize, "i32");
		if (!zlibDecompressor.inflateBack9InFunc) {
			zlibDecompressor.inflateBack9InFunc = zlibModule.addFunction((_, buf) => {
				const availIn = zlibModule.getValue(zlibDecompressor.streamPtr + 4, "i32");
				if (availIn > 0) {
					const nextIn = zlibModule.getValue(zlibDecompressor.streamPtr + 0, "i32");
					zlibModule.setValue(buf, nextIn, "i32");
					return availIn;
				}
				return 0;
			}, "iii");
			zlibDecompressor.inflateBack9OutFunc = zlibModule.addFunction((_, buf, len) => {
				const nextOut = zlibModule.getValue(zlibDecompressor.streamPtr + 8, "i32");
				const availOut = zlibModule.getValue(zlibDecompressor.streamPtr + 12, "i32");
				const copyLen = Math.min(len, availOut);
				for (let i = 0; i < copyLen; i++) {
					const value = zlibModule.getValue(buf + i, "i8");
					zlibModule.setValue(nextOut + i, value, "i8");
				}
				zlibModule.setValue(zlibDecompressor.streamPtr + 8, nextOut + copyLen, "i32");
				zlibModule.setValue(zlibDecompressor.streamPtr + 12, availOut - copyLen, "i32");

				return 0;
			}, "iiii");
		}
		const result = zlibModule.ccall("inflateBack9", "number", ["number", "number", "number", "number", "number"], [
			zlibDecompressor.streamPtr,
			zlibDecompressor.inflateBack9InFunc,
			0,
			zlibDecompressor.inflateBack9OutFunc,
			0,
		]);
		if (finish ? result !== 1 : (result !== 0 && result !== 1)) {
			const msg = finish ? "expected end of stream but got error code" : "failed with error code";
			throw new Error(`Deflate64 decompression ${finish ? "incomplete: " + msg : msg}: ${result}`);
		}
		const outputLength = zlibModule.getValue(zlibDecompressor.streamPtr + 8, "i32") - zlibDecompressor.outputPtr;
		return copyFromWasmMemory(zlibModule, zlibDecompressor.outputPtr, outputLength);
	}

	async finish() {
		const zlibDecompressor = this;
		const finalData = await zlibDecompressor.decompress(new Uint8Array(0), true);
		zlibDecompressor.cleanup();
		return finalData;
	}

	cleanup() {
		const zlibDecompressor = this;
		if (zlibModule && zlibDecompressor.streamPtr) {
			if (zlibDecompressor.isDeflate64) {
				zlibModule._inflateBack9End(zlibDecompressor.streamPtr);
				if (zlibDecompressor.windowPtr) {
					zlibModule._free(zlibDecompressor.windowPtr);
					zlibDecompressor.windowPtr = null;
				}
				if (zlibDecompressor.inflateBack9InFunc) {
					zlibModule.removeFunction(zlibDecompressor.inflateBack9InFunc);
					zlibDecompressor.inflateBack9InFunc = null;
				}
				if (zlibDecompressor.inflateBack9OutFunc) {
					zlibModule.removeFunction(zlibDecompressor.inflateBack9OutFunc);
					zlibDecompressor.inflateBack9OutFunc = null;
				}
			} else {
				zlibModule._inflateEnd(zlibDecompressor.streamPtr);
			}
			zlibModule._free(zlibDecompressor.streamPtr);
			zlibModule._free(zlibDecompressor.inputPtr);
			zlibModule._free(zlibDecompressor.outputPtr);
			zlibDecompressor.streamPtr = null;
			zlibDecompressor.inputPtr = null;
			zlibDecompressor.outputPtr = null;
		}
		zlibDecompressor.initialized = false;
	}
}

class BaseStreamPolyfill {
	constructor(format, processorClass, methodName, processorArgs = []) {
		const baseProcessor = this;
		baseProcessor.format = format;
		baseProcessor.createTransformStream(processorClass, methodName, processorArgs);
	}

	createTransformStream(ProcessorClass, methodName, processorArgs) {
		const baseProcessor = this;
		let processor;
		const transformStream = new TransformStream({
			start: async () => {
				processor = new ProcessorClass(...processorArgs, baseProcessor.format);
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
		baseProcessor._readable = transformStream.readable;
		baseProcessor._writable = transformStream.writable;
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
