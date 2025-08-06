# zlib-web-streams

A WebAssembly implementation of the zlib compression library that provides the same APIs as Web Compression Streams with additional features.

## Features

- **Web Standards Compatible**: Drop-in replacement for `CompressionStream` and `DecompressionStream`
- **Compression Levels**: Support for compression levels 1-9 (unlike native Web APIs)
- **Multiple Formats**: Deflate, Deflate-raw, Gzip, and Deflate64 support
- **Deflate64 Decompression**: Handles Deflate64-compressed data (decompression only)
- **High Performance**: Optimized WebAssembly with direct memory access
- **Small Bundle**: 50KB WASM + 5.6KB JS wrapper

## Usage

### Basic Compression/Decompression

```javascript
import { CompressionStream, DecompressionStream } from 'zlib-web-streams';

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

### Deflate-raw Support

```javascript
// Raw deflate format (no headers, just compressed data)
const rawCompressor = new CompressionStream('deflate-raw');
const rawDecompressor = new DecompressionStream('deflate-raw');

// Useful for custom protocols or when you need minimal overhead
const compressed = inputData.pipeThrough(rawCompressor);
const decompressed = compressed.pipeThrough(rawDecompressor);
```

### Deflate64 Support

```javascript
// Decompress Deflate64 data (common in ZIP files)
const deflate64Decompressor = new DecompressionStream('deflate64');
const result = deflate64Data.pipeThrough(deflate64Decompressor);

// Decompress Deflate64-raw data (without headers)
const deflate64RawDecompressor = new DecompressionStream('deflate64-raw');
const rawResult = deflate64RawData.pipeThrough(deflate64RawDecompressor);
```

### CRC32 Support

The library provides CRC32 computation and verification for `deflate-raw` format only:

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
// Verify CRC32 during decompression
const expectedCRC32 = 0x12345678; // Known CRC32 value
const decompressor = new DecompressionStream('deflate-raw', { expectedCRC32 });

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
```

#### CRC32 Options

| Option | Type | Format | Description |
|--------|------|---------|-------------|
| `computeCRC32` | boolean | `deflate-raw` only | Enable CRC32 computation during compression |
| `expectedCRC32` | number | `deflate-raw` only | Expected CRC32 value for verification during decompression |

**Note**: CRC32 features are only available for the `deflate-raw` format. Other formats (`deflate`, `gzip`, `deflate64`) ignore CRC32 options since they have their own integrity mechanisms.

## Supported Formats

| Format | Compression | Decompression | Notes |
|--------|-------------|---------------|-------|
| `deflate` | ✅ | ✅ | RFC 1951 (with zlib headers) |
| `deflate-raw` | ✅ | ✅ | Raw deflate (no headers) |
| `gzip` | ✅ | ✅ | RFC 1952 |
| `deflate64` | ❌ | ✅ | ZIP deflate64 method |
| `deflate64-raw` | ❌ | ✅ | Raw deflate64 (no headers) |

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
  - `expectedCRC32`: number (only for `deflate-raw`, throws error if CRC32 doesn't match)

**Properties:**
- `crc32`: number (computed CRC32 value, only for `deflate-raw`)

## Browser Compatibility

- Modern browsers with WebAssembly support
- Web Workers
- Node.js with WebAssembly support

## License

Zlib License (same as the original zlib library)
