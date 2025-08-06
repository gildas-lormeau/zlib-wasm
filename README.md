# zlib-wasm

A WebAssembly implementation of the zlib compression library that provides the same APIs as Web Compression Streams with additional features.

## Features

- **Web Standards Compatible**: Drop-in replacement for `CompressionStream` and `DecompressionStream`
- **Compression Levels**: Support for compression levels 1-9 (unlike native Web APIs)
- **Multiple Formats**: Deflate, Gzip, and Deflate64 support
- **Deflate64 Decompression**: Handles Deflate64-compressed data (decompression only)
- **High Performance**: Optimized WebAssembly with direct memory access
- **Small Bundle**: 50KB WASM + 5.6KB JS wrapper

## Usage

### Basic Compression/Decompression

```javascript
import { CompressionStream, DecompressionStream } from 'zlib-wasm';

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
// Decompress Deflate64 data (common in ZIP files)
const deflate64Decompressor = new DecompressionStream('deflate64');
const result = deflate64Data.pipeThrough(deflate64Decompressor);
```

## Supported Formats

| Format | Compression | Decompression | Notes |
|--------|-------------|---------------|-------|
| `deflate` | ✅ | ✅ | RFC 1951 |
| `gzip` | ✅ | ✅ | RFC 1952 |
| `deflate64` | ❌ | ✅ | ZIP deflate64 method |

## API

The library implements the standard [Web Compression Streams API](https://developer.mozilla.org/en-US/docs/Web/API/Compression_Streams_API) with these extensions:

- **CompressionStream**: Accepts optional `{ level: 1-9 }` parameter
- **DecompressionStream**: Supports `'deflate64'` format for decompression

## Browser Compatibility

- Modern browsers with WebAssembly support
- Web Workers
- Node.js with WebAssembly support

## License

Zlib License (same as the original zlib library)
