# zlib-web-streams

A WebAssembly implementation of the zlib compression library that provides the same APIs as Web Compression Streams with additional features.

## Features

- **Web Standards Compatible**: Drop-in replacement for `CompressionStream` and `DecompressionStream`
- **Compression Levels**: Support for compression levels 1-9 (unlike native Web APIs)
- **Deflate64 Decompression**: Handles Deflate64-compressed data (decompression only)
- **High Performance**: Optimized WebAssembly with direct memory access
- **Small Bundle**: 50KB WASM + 5.6KB JS wrapper

## Install from NPM

```sh
npm install zlib-web-streams
```

## Usage

### Basic Compression/Decompression

```javascript
import { CompressionStream, DecompressionStream } from 'zlib-web-streams/dist/min';

// Compress data
const compressor = new CompressionStream('deflate');
const compressed = await new Response(
  new Uint8Array([1, 2, 3, 4, 5]).pipeThrough(compressor)
).arrayBuffer();

// Decompress data
const decompressor = new DecompressionStream('deflate');
const decompressed = await new Response(
  new Uint8Array(compressed).pipeThrough(decompressor)
).arrayBuffer();
```

### Compression Levels

```javascript
// Maximum compression (slower)
const maxCompression = new CompressionStream('gzip', { level: 9 });

// Fast compression (larger output)
const fastCompression = new CompressionStream('gzip', { level: 1 });

// Balanced (default)
const balanced = new CompressionStream('gzip', { level: 6 });
```

### Deflate64 Support

```javascript
// Decompress Deflate64 data
const deflate64Decompressor = new DecompressionStream('deflate64');
const result = deflate64Data.pipeThrough(deflate64Decompressor);

// Decompress Deflate64-raw data (without headers)
const deflate64RawDecompressor = new DecompressionStream('deflate64-raw');
const rawResult = deflate64RawData.pipeThrough(deflate64RawDecompressor);
```

**Important Note on Deflate64 Streaming:**

Due to the underlying WebAssembly implementation using `inflateBack9`, Deflate64 decompression requires buffering the complete input stream before processing. This means:

- ✅ **Works**: All chunk sizes will decompress successfully
- ⚠️ **Limitation**: Input data is buffered internally until the stream ends
- 💡 **Impact**: Higher memory usage for large Deflate64 files compared to other formats

This buffering approach maintains API compatibility while handling the technical constraints of the Deflate64 implementation. For optimal memory usage with large files, consider using standard deflate format when possible.

### CRC32 Support

The library provides CRC32 computation and verification for `deflate-raw` and `deflate64-raw` formats:

#### CRC32 Computation

```javascript
// Enable CRC32 computation during compression
const compressor = new CompressionStream('deflate-raw', { computeCRC32: true });
const compressed = await new Response(
  inputData.pipeThrough(compressor)
).arrayBuffer();

// Access the computed CRC32 value
const crc32Value = compressor.crc32;
console.log(`CRC32: 0x${crc32Value.toString(16).padStart(8, '0').toUpperCase()}`);
```

#### CRC32 Verification

```javascript
// Method 1: Verify CRC32 with expected value (deflate-raw or deflate64-raw)
const expectedCRC32 = 0x12345678; // Known CRC32 value
const decompressor = new DecompressionStream('deflate-raw', { expectedCRC32 });
// or
const deflate64Decompressor = new DecompressionStream('deflate64-raw', { expectedCRC32 });

try {
  const decompressed = await new Response(
    compressedData.pipeThrough(decompressor)
  ).arrayBuffer();
  
  // If we reach here, CRC32 verification passed
  console.log('Data integrity verified!');
} catch (error) {
  if (error.message.includes('CRC32 mismatch')) {
    console.error('Data corruption detected:', error.message);
  }
}

// Method 2: Enable CRC32 computation without validation
const decompressor2 = new DecompressionStream('deflate-raw', { computeCRC32: true });
const decompressed2 = await new Response(
  compressedData.pipeThrough(decompressor2)
).arrayBuffer();

// Access the computed CRC32 value after decompression
const computedCRC32 = decompressor2.crc32;
console.log(`Computed CRC32: 0x${computedCRC32.toString(16).padStart(8, '0').toUpperCase()}`);
```

#### CRC32 Options

| Option          | Type    | Operation     | Supported Formats                           | Description                                    |
|-----------------|---------|---------------|---------------------------------------------|------------------------------------------------|
| `computeCRC32`  | boolean | Compression, Decompression | `deflate-raw` (compression), `deflate-raw`/`deflate64-raw` (decompression) | Compute CRC32 checksum during compression or decompression |
| `expectedCRC32` | number  | Decompression | `deflate-raw`, `deflate64-raw` | Verify data integrity against expected CRC32  |

**Note**: CRC32 computation is only available for `deflate-raw` format during compression. CRC32 verification works for both `deflate-raw` and `deflate64-raw` formats during decompression. Other formats (`deflate`, `gzip`, `deflate64`) ignore CRC32 options since they have their own integrity mechanisms.

## Supported Formats

| Format          | Compression | Decompression | Notes                        |
| --------------- | ----------- | ------------- | ---------------------------- |
| `deflate`       | ✅           | ✅             | RFC 1951 (with zlib headers) |
| `deflate-raw`   | ✅           | ✅             | Raw deflate (no headers)     |
| `gzip`          | ✅           | ✅             | RFC 1952                     |
| `deflate64`     | ❌           | ✅*            | ZIP deflate64 method         |
| `deflate64-raw` | ❌           | ✅*            | Raw deflate64 (no headers)   |

\* *Deflate64 formats internally buffer complete input stream before processing due to WebAssembly implementation constraints. This ensures compatibility with all chunk sizes but may use more memory for large files.*

## API

The library implements the standard [Web Compression Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API) with these extensions:

### CompressionStream

```javascript
new CompressionStream(format, options?)
```

**Parameters:**
- `format`: `'deflate'` | `'deflate-raw'` | `'gzip'`
- `options` (optional):
  - `level`: 1-9 (compression level, default: 6)
  - `computeCRC32`: boolean (only for `deflate-raw`, default: false)

**Properties:**
- `crc32`: number (only available when `computeCRC32: true` for `deflate-raw`)

### DecompressionStream

```javascript
new DecompressionStream(format, options?)
```

**Parameters:**
- `format`: `'deflate'` | `'deflate-raw'` | `'gzip'` | `'deflate64'` | `'deflate64-raw'`
- `options` (optional):
  - `expectedCRC32`: number (only for `deflate-raw` and `deflate64-raw`, throws error if CRC32 doesn't match)
  - `computeCRC32`: boolean (only for `deflate-raw` and `deflate64-raw`, enables CRC32 computation without validation)

**Properties:**
- `crc32`: number (computed CRC32 value, only for `deflate-raw` and `deflate64-raw`)

## Browser Compatibility

- Modern browsers with WebAssembly support
- Web Workers
- Node.js with WebAssembly support

## License

Zlib License (same as the original zlib library)
