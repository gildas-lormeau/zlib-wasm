// deno-lint-ignore-file no-this-alias
/**
 * CompressionStream & DecompressionStream Polyfill
 */

// zlib constants
const Z_NO_FLUSH = 0;
const Z_PARTIAL_FLUSH = 1;
const Z_SYNC_FLUSH = 2;
const Z_FULL_FLUSH = 3;
const Z_FINISH = 4;
const Z_OK = 0;
const Z_STREAM_END = 1;
const Z_DEFAULT_COMPRESSION = -1;
const Z_BUF_ERROR = -5;

// Buffer sizes
const DEFAULT_INPUT_SIZE = 32768;
const DEFAULT_OUTPUT_SIZE = 32768;
const STREAM_STRUCT_SIZE = 56;
const DEFLATE64_WINDOW_SIZE = 65536;

// Format strings
const FORMAT_DEFLATE = "deflate";
const FORMAT_DEFLATE_RAW = "deflate-raw";
const FORMAT_GZIP = "gzip";
const FORMAT_DEFLATE64 = "deflate64";
const FORMAT_DEFLATE64_RAW = "deflate64-raw";

// Window bits for different formats
const DEFLATE_WINDOW_BITS = 15;
const DEFLATE_RAW_WINDOW_BITS = -15;
const GZIP_WINDOW_BITS = 31;

// Method constants
const DEFLATE_METHOD = 8;
const DEFLATE_MEM_LEVEL = 8;
const DEFLATE_STRATEGY = 0;

// Function signatures for emscripten
const SIGNATURE_III = "iii";
const SIGNATURE_IIII = "iiii";

// zlib version string
const ZLIB_VERSION = "1.3.1.1-motley";

// Function names
const FUNC_DEFLATE_INIT2 = "deflateInit2_";
const FUNC_INFLATE_INIT2 = "inflateInit2_";
const FUNC_INFLATE_BACK9_INIT = "inflateBack9Init_";
const FUNC_INFLATE_BACK9 = "inflateBack9";
const FUNC_DEFLATE = "_deflate";
const FUNC_INFLATE = "_inflate";
const FUNC_DEFLATE_END = "_deflateEnd";
const FUNC_INFLATE_END = "_inflateEnd";
const FUNC_INFLATE_BACK9_END = "_inflateBack9End";
const FUNC_MALLOC = "_malloc";
const FUNC_FREE = "_free";
const FUNC_CRC32 = "_crc32";

// Method names
const METHOD_COMPRESS = "compress";
const METHOD_DECOMPRESS = "decompress";

// Type names
const TYPE_NUMBER = "number";
const TYPE_STRING = "string";

// Other constants
const FLUSH_MODE_AUTO = "auto";
const ERROR_UNKNOWN = "unknown error";
const HEX_PAD_LENGTH = 8;
const HEX_PAD_CHAR = '0';
const DEFAULT_COMPRESSOR_LEVEL = 6;

// Error descriptions
const ERROR_DESCRIPTIONS = {
	'-1': 'system error',
	'-2': 'stream error',
	'-3': 'data error (corrupted/invalid data)',
	'-4': 'memory error',
	'-5': 'buffer error',
	'-6': 'version error'
};

// Error messages
const MSG_COMPRESSION_INIT_FAILED = "Compression initialization failed";
const MSG_DECOMPRESSION_INIT_FAILED = "Decompression initialization failed";
const MSG_COMPRESSION_FAILED = "Compression failed";
const MSG_DECOMPRESSION_FAILED = "Decompression failed";
const MSG_DEFLATE64_DECOMPRESSION_FAILED = "Deflate64 decompression failed with error code";
const MSG_DEFLATE64_DECOMPRESSION_INCOMPLETE = "Deflate64 decompression incomplete: expected end of stream but got error code";
const MSG_CRC32_MISMATCH = "CRC32 mismatch: expected";
const MSG_CHUNK_SIZE_EXCEEDED = "Chunk size";
const MSG_EXCEEDS_BUFFER_SIZE = "exceeds buffer size";
const MSG_UNSUPPORTED_FORMAT = "Unsupported format";

const FLUSH_MODES = {
	none: Z_NO_FLUSH,
	partial: Z_PARTIAL_FLUSH,
	sync: Z_SYNC_FLUSH,
	full: Z_FULL_FLUSH,
	finish: Z_FINISH,
	auto: Z_NO_FLUSH,
};

let zlibModule, zlibModulePromise;

class BufferPool {
	constructor() {
		const bufferPool = this;
		bufferPool.pools = new Map();
		bufferPool.maxPoolSize = 8;
	}

	get(size) {
		const bufferPool = this;
		if (!bufferPool.pools.has(size)) {
			bufferPool.pools.set(size, []);
		}
		const pool = bufferPool.pools.get(size);
		if (pool.length > 0) {
			return pool.pop();
		}
		return new Uint8Array(size);
	}

	release(buffer) {
		const bufferPool = this;
		const size = buffer.length;
		if (!bufferPool.pools.has(size)) {
			bufferPool.pools.set(size, []);
		}
		const pool = bufferPool.pools.get(size);
		if (pool.length < bufferPool.maxPoolSize) {
			pool.push(buffer);
		}
	}

	clear() {
		const bufferPool = this;
		bufferPool.pools.clear();
	}
}

const bufferPool = new BufferPool();

function initModule(moduleCode, wasmBinary) {
	const moduleFunction = new Function([], moduleCode + ";return ZlibModule");
	const ZlibModuleFactory = moduleFunction([]);
	zlibModulePromise = ZlibModuleFactory({ wasmBinary });
}

class ZlibCompressor {
	constructor(level = Z_DEFAULT_COMPRESSION, format = FORMAT_DEFLATE, computeCRC32 = false) {
		const zlibCompressor = this;
		zlibCompressor.level = level;
		zlibCompressor.format = format;
		zlibCompressor.streamPtr = null;
		zlibCompressor.inputPtr = null;
		zlibCompressor.outputPtr = null;
		zlibCompressor.inputSize = DEFAULT_INPUT_SIZE;
		zlibCompressor.outputSize = DEFAULT_OUTPUT_SIZE;
		const isRawFormat = format === FORMAT_DEFLATE_RAW;
		zlibCompressor.computeCRC32 = isRawFormat && computeCRC32;
		zlibCompressor.crc32 = 0;
	}

	async initialize() {
		const zlibCompressor = this;
		if (!zlibModule) {
			zlibModule = await zlibModulePromise;
		}
		zlibCompressor.streamPtr = zlibModule[FUNC_MALLOC](STREAM_STRUCT_SIZE);
		zlibCompressor.inputPtr = zlibModule[FUNC_MALLOC](zlibCompressor.inputSize);
		zlibCompressor.outputPtr = zlibModule[FUNC_MALLOC](zlibCompressor.outputSize);
		initStream(zlibModule, zlibCompressor.streamPtr);
		const result = zlibModule.ccall(FUNC_DEFLATE_INIT2, TYPE_NUMBER, [
			TYPE_NUMBER,
			TYPE_NUMBER,
			TYPE_NUMBER,
			TYPE_NUMBER,
			TYPE_NUMBER,
			TYPE_NUMBER,
			TYPE_STRING,
			TYPE_NUMBER,
		], [zlibCompressor.streamPtr, zlibCompressor.level, DEFLATE_METHOD, getWindowBits(zlibCompressor.format), DEFLATE_MEM_LEVEL, DEFLATE_STRATEGY, ZLIB_VERSION, STREAM_STRUCT_SIZE]);
		if (result !== 0) {
			throw new Error(MSG_COMPRESSION_INIT_FAILED + ": " + result);
		}
	}

	compress(data, finish = false, flushMode = FLUSH_MODE_AUTO) {
		const zlibCompressor = this;
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
				const chunkResult = zlibCompressor.compressSingleChunk(chunk, finish && isLastChunk, flushMode);
				if (chunkResult.length > 0) {
					results.push(chunkResult);
				}
				offset += chunkSize;
			}
			const totalLength = results.reduce((sum, chunk) => sum + chunk.length, 0);
			const combined = bufferPool.get(totalLength);
			let combinedOffset = 0;
			for (const result of results) {
				combined.set(result, combinedOffset);
				combinedOffset += result.length;
			}
			return combined.subarray(0, totalLength);
		}
		return zlibCompressor.compressSingleChunk(data, finish, flushMode);
	}

	compressSingleChunk(data, finish = false, flushMode = FLUSH_MODE_AUTO) {
		const zlibCompressor = this;
		if (data.length > zlibCompressor.inputSize) {
			throw new Error(MSG_CHUNK_SIZE_EXCEEDED + " " + data.length + " " + MSG_EXCEEDS_BUFFER_SIZE + " " + zlibCompressor.inputSize);
		}
		if (zlibCompressor.level === 0 && zlibCompressor.format === FORMAT_DEFLATE_RAW) {
			if (zlibCompressor.computeCRC32 && data.length > 0) {
				const tempPtr = zlibModule[FUNC_MALLOC](data.length);
				try {
					zlibModule.HEAPU8.set(data, tempPtr);
					zlibCompressor.crc32 = zlibModule[FUNC_CRC32](zlibCompressor.crc32, tempPtr, data.length);
				} finally {
					zlibModule[FUNC_FREE](tempPtr);
				}
			}
			return data;
		}

		copyToWasmMemory(zlibModule, data, zlibCompressor.inputPtr);
		if (zlibCompressor.computeCRC32 && data.length > 0) {
			zlibCompressor.crc32 = zlibModule[FUNC_CRC32](zlibCompressor.crc32, zlibCompressor.inputPtr, data.length);
		}
		const streamPtrU32 = zlibCompressor.streamPtr >>> 2;
		zlibModule.HEAPU32[streamPtrU32 + 0] = zlibCompressor.inputPtr;
		zlibModule.HEAPU32[streamPtrU32 + 1] = data.length;
		zlibModule.HEAPU32[streamPtrU32 + 3] = zlibCompressor.outputPtr;
		zlibModule.HEAPU32[streamPtrU32 + 4] = zlibCompressor.outputSize;
		const flushType = finish ? Z_FINISH : (FLUSH_MODES[flushMode] || Z_NO_FLUSH);
		const result = zlibModule[FUNC_DEFLATE](zlibCompressor.streamPtr, flushType);
		if (result < 0 || (finish && result !== Z_STREAM_END) || (!finish && result !== Z_OK)) {
			throw new Error(MSG_COMPRESSION_FAILED + ": " + result);
		}
		const availOut = zlibModule.HEAPU32[streamPtrU32 + 4];
		const outputLength = zlibCompressor.outputSize - availOut;
		return copyFromWasmMemory(zlibModule, zlibCompressor.outputPtr, outputLength);
	}

	finish() {
		const zlibCompressor = this;
		const finalData = zlibCompressor.compress(new Uint8Array(0), true);
		zlibCompressor.cleanup();
		return finalData;
	}

	cleanup() {
		const zlibCompressor = this;
		if (zlibModule && zlibCompressor.streamPtr) {
			zlibModule[FUNC_DEFLATE_END](zlibCompressor.streamPtr);
			zlibModule[FUNC_FREE](zlibCompressor.streamPtr);
			zlibModule[FUNC_FREE](zlibCompressor.inputPtr);
			zlibModule[FUNC_FREE](zlibCompressor.outputPtr);
			zlibCompressor.streamPtr = null;
			zlibCompressor.inputPtr = null;
			zlibCompressor.outputPtr = null;
		}
	}
}

class ZlibDecompressor {
	constructor(format = FORMAT_DEFLATE, computeCRC32 = false, expectedCRC32) {
		const zlibDecompressor = this;
		zlibDecompressor.format = format;
		zlibDecompressor.streamPtr = null;
		zlibDecompressor.inputPtr = null;
		zlibDecompressor.outputPtr = null;
		zlibDecompressor.windowPtr = null;
		zlibDecompressor.inputSize = DEFAULT_INPUT_SIZE;
		zlibDecompressor.outputSize = DEFAULT_OUTPUT_SIZE;
		zlibDecompressor.isDeflate64 = format === FORMAT_DEFLATE64 || format === FORMAT_DEFLATE64_RAW;
		const isRawFormat = format === FORMAT_DEFLATE_RAW || format === FORMAT_DEFLATE64_RAW;
		zlibDecompressor.computeCRC32 = isRawFormat && computeCRC32;
		zlibDecompressor.expectedCRC32 = expectedCRC32;
		zlibDecompressor.crc32 = 0;
	}

	async initialize() {
		const zlibDecompressor = this;
		if (!zlibModule) {
			zlibModule = await zlibModulePromise;
		}
		zlibDecompressor.streamPtr = zlibModule[FUNC_MALLOC](STREAM_STRUCT_SIZE);
		zlibDecompressor.inputPtr = zlibModule[FUNC_MALLOC](zlibDecompressor.inputSize);
		zlibDecompressor.outputPtr = zlibModule[FUNC_MALLOC](zlibDecompressor.outputSize);
		initStream(zlibModule, zlibDecompressor.streamPtr);
		let result;
		if (zlibDecompressor.isDeflate64) {
			zlibDecompressor.windowPtr = zlibModule[FUNC_MALLOC](DEFLATE64_WINDOW_SIZE);
			result = zlibModule.ccall(FUNC_INFLATE_BACK9_INIT, TYPE_NUMBER, [TYPE_NUMBER, TYPE_NUMBER, TYPE_STRING, TYPE_NUMBER], [
				zlibDecompressor.streamPtr,
				zlibDecompressor.windowPtr,
				ZLIB_VERSION,
				STREAM_STRUCT_SIZE,
			]);
		} else {
			result = zlibModule.ccall(FUNC_INFLATE_INIT2, TYPE_NUMBER, [TYPE_NUMBER, TYPE_NUMBER, TYPE_STRING, TYPE_NUMBER], [
				zlibDecompressor.streamPtr,
				getWindowBits(zlibDecompressor.format),
				ZLIB_VERSION,
				STREAM_STRUCT_SIZE,
			]);
		}
		if (result !== 0) {
			throw new Error(MSG_DECOMPRESSION_INIT_FAILED + ": " + result);
		}
	}

	decompress(data, finish = false, flushMode = FLUSH_MODE_AUTO) {
		const zlibDecompressor = this;
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
			const streamPtrU32 = zlibDecompressor.streamPtr >>> 2;
			zlibModule.HEAPU32[streamPtrU32 + 0] = zlibDecompressor.inputPtr;
			zlibModule.HEAPU32[streamPtrU32 + 1] = inputChunkSize;
			zlibModule.HEAPU32[streamPtrU32 + 3] = zlibDecompressor.outputPtr;
			zlibModule.HEAPU32[streamPtrU32 + 4] = zlibDecompressor.outputSize;
			const isLastChunk = totalInputProcessed + inputChunkSize >= data.length;
			const flushType = (finish && isLastChunk) ? Z_FINISH : (FLUSH_MODES[flushMode] || Z_SYNC_FLUSH);
			const result = zlibModule[FUNC_INFLATE](zlibDecompressor.streamPtr, flushType);
			if (result < 0 && result !== Z_BUF_ERROR) {
				throw new Error(MSG_DECOMPRESSION_FAILED + ": " + result);
			}
			const availOut = zlibModule.HEAPU32[streamPtrU32 + 4];
			const outputLength = zlibDecompressor.outputSize - availOut;
			if (outputLength > 0) {
				const outputChunk = copyFromWasmMemory(zlibModule, zlibDecompressor.outputPtr, outputLength);
				if (zlibDecompressor.computeCRC32) {
					zlibDecompressor.crc32 = zlibModule[FUNC_CRC32](zlibDecompressor.crc32, zlibDecompressor.outputPtr, outputLength);
				}
				results.push(outputChunk);
			}
			const inputProcessed = zlibModule.HEAPU32[streamPtrU32 + 1];
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
		const output = bufferPool.get(totalLength);
		let offset = 0;
		for (const chunk of results) {
			output.set(chunk, offset);
			offset += chunk.length;
		}
		return output.subarray(0, totalLength);
	}

	decompressDeflate64(data, finish) {
		const zlibDecompressor = this;
		if (zlibDecompressor.deflate64Complete) {
			return new Uint8Array(0);
		}
		if (!zlibDecompressor.deflate64InputBuffer) {
			zlibDecompressor.deflate64InputBuffer = [];
			zlibDecompressor.deflate64InputBufferSize = 0;
		}
		if (data.length > 0) {
			zlibDecompressor.deflate64InputBuffer.push(data);
			zlibDecompressor.deflate64InputBufferSize += data.length;
		}
		if (!finish) {
			return new Uint8Array(0);
		}
		const combinedInput = new Uint8Array(zlibDecompressor.deflate64InputBufferSize);
		let offset = 0;
		for (const chunk of zlibDecompressor.deflate64InputBuffer) {
			combinedInput.set(chunk, offset);
			offset += chunk.length;
		}
		copyToWasmMemory(zlibModule, combinedInput, zlibDecompressor.inputPtr);
		const results = [];
		const inFunc = zlibModule.addFunction((_, bufPtr) => {
			if (combinedInput.length === 0) {
				return 0;
			}
			zlibModule.HEAPU32[bufPtr >>> 2] = zlibDecompressor.inputPtr;
			return combinedInput.length;
		}, SIGNATURE_III);
		const outFunc = zlibModule.addFunction((_, buf, len) => {
			if (len > 0) {
				if (zlibDecompressor.computeCRC32) {
					zlibDecompressor.crc32 = zlibModule[FUNC_CRC32](zlibDecompressor.crc32, buf, len);
				}
				const outputChunk = copyFromWasmMemory(zlibModule, buf, len);
				results.push(outputChunk);
			}
			return 0;
		}, SIGNATURE_IIII);
		const result = zlibModule.ccall(FUNC_INFLATE_BACK9, TYPE_NUMBER, [TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER, TYPE_NUMBER], [
			zlibDecompressor.streamPtr,
			inFunc,
			0,
			outFunc,
			0,
		]);
		zlibModule.removeFunction(inFunc);
		zlibModule.removeFunction(outFunc);
		if (result === 1) {
			zlibDecompressor.deflate64Complete = true;
			zlibDecompressor.deflate64InputBuffer = [];
			zlibDecompressor.deflate64InputBufferSize = 0;
		}
		if (result < 0) {
			const msg = MSG_DEFLATE64_DECOMPRESSION_FAILED;
			throw new Error(msg + ": " + result);
		}
		if (finish && result !== 1 && !zlibDecompressor.deflate64Complete) {
			const msg = MSG_DEFLATE64_DECOMPRESSION_INCOMPLETE;
			throw new Error(msg + ": " + result);
		}
		const totalLength = results.reduce((sum, chunk) => sum + chunk.length, 0);
		const output = bufferPool.get(totalLength);
		let outputOffset = 0;
		for (const chunk of results) {
			output.set(chunk, outputOffset);
			outputOffset += chunk.length;
		}
		return output.subarray(0, totalLength);
	}

	finish() {
		const zlibDecompressor = this;
		const finalData = zlibDecompressor.decompress(new Uint8Array(0), true);
		zlibDecompressor.cleanup();
		if (zlibDecompressor.expectedCRC32 !== undefined && zlibDecompressor.computeCRC32 && zlibDecompressor.crc32 !== zlibDecompressor.expectedCRC32) {
			throw new Error(MSG_CRC32_MISMATCH + " " + zlibDecompressor.expectedCRC32.toString(16).toUpperCase().padStart(HEX_PAD_LENGTH, HEX_PAD_CHAR) + ", got " + zlibDecompressor.crc32.toString(16).toUpperCase().padStart(HEX_PAD_LENGTH, HEX_PAD_CHAR));
		}
		return finalData;
	}

	cleanup() {
		const zlibDecompressor = this;
		if (zlibModule && zlibDecompressor.streamPtr) {
			if (zlibDecompressor.isDeflate64) {
				zlibModule[FUNC_INFLATE_BACK9_END](zlibDecompressor.streamPtr);
				if (zlibDecompressor.windowPtr) {
					zlibModule[FUNC_FREE](zlibDecompressor.windowPtr);
					zlibDecompressor.windowPtr = null;
				}
			} else {
				zlibModule[FUNC_INFLATE_END](zlibDecompressor.streamPtr);
			}
			zlibModule[FUNC_FREE](zlibDecompressor.streamPtr);
			zlibModule[FUNC_FREE](zlibDecompressor.inputPtr);
			zlibModule[FUNC_FREE](zlibDecompressor.outputPtr);
			zlibDecompressor.streamPtr = null;
			zlibDecompressor.inputPtr = null;
			zlibDecompressor.outputPtr = null;
		}
	}
}

class BaseStreamPolyfill {
	constructor(format, processorClass, methodName, processorArgs = []) {
		const baseStream = this;
		baseStream.format = format;
		baseStream.processor = null;
		baseStream._createTransformStream(processorClass, methodName, processorArgs);
	}

	_createTransformStream(ProcessorClass, methodName, processorArgs) {
		const baseStream = this;
		const transformStream = new TransformStream({
			start: async () => {
				baseStream.processor = new ProcessorClass(...processorArgs);
				await baseStream.processor.initialize();
			},
			transform: (chunk, controller) => {
				const data = convertChunkToUint8Array(chunk);
				const result = baseStream.processor[methodName](data, false);
				if (result.length > 0) {
					controller.enqueue(result);
				}
			},
			flush: (controller) => {
				try {
					const finalData = baseStream.processor.finish();
					if (finalData.length > 0) {
						controller.enqueue(finalData);
					}
					baseStream.processor.cleanup();
				} catch (error) {
					try {
						baseStream.processor.cleanup();
					} catch (_) {
						// ignored
					}
					controller.error(error);
				}
			},
		});
		baseStream.readable = transformStream.readable;
		baseStream.writable = transformStream.writable;
	}
}

class CompressionStream extends BaseStreamPolyfill {
	constructor(format, options = {}) {
		const level = options.level !== undefined ? options.level : DEFAULT_COMPRESSOR_LEVEL;
		const computeCRC32 = options.computeCRC32 || false;
		super(format, ZlibCompressor, METHOD_COMPRESS, [level, format, computeCRC32]);
	}

	get crc32() {
		return this.processor ? this.processor.crc32 : 0;
	}
}

class DecompressionStream extends BaseStreamPolyfill {
	constructor(format, options = {}) {
		const computeCRC32 = options.expectedCRC32 !== undefined || (options.computeCRC32 !== undefined && options.computeCRC32 !== false);
		super(format, ZlibDecompressor, METHOD_DECOMPRESS, [format, computeCRC32, options.expectedCRC32]);
	}

	get crc32() {
		return this.processor ? this.processor.crc32 : 0;
	}
}

export { CompressionStream, DecompressionStream, initModule, clearBufferPool };

function clearBufferPool() {
	bufferPool.clear();
}

function getWindowBits(format) {
	switch (format) {
		case FORMAT_DEFLATE:
			return DEFLATE_WINDOW_BITS;
		case FORMAT_DEFLATE_RAW:
			return DEFLATE_RAW_WINDOW_BITS;
		case FORMAT_GZIP:
			return GZIP_WINDOW_BITS;
		default:
			throw new Error(MSG_UNSUPPORTED_FORMAT + ": " + format);
	}
}

function copyToWasmMemory(zlibModule, sourceData, targetPtr) {
	zlibModule.HEAPU8.set(sourceData, targetPtr);
}

function copyFromWasmMemory(zlibModule, sourcePtr, length) {
	if (length === 0) {
		return new Uint8Array(0);
	}
	const buffer = bufferPool.get(length);
	buffer.set(zlibModule.HEAPU8.subarray(sourcePtr, sourcePtr + length));
	return buffer.subarray(0, length);
}

function initStream(zlibModule, streamPtr) {
	zlibModule.HEAPU8.fill(0, streamPtr, streamPtr + STREAM_STRUCT_SIZE);
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
