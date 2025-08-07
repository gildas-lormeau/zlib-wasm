import { CompressionStream, DecompressionStream, initModule } from "./mod.js";

const moduleCode = await (await fetch(new URL("../dist-wasm/zlib-module.js", import.meta.url))).text();
const wasmBinary = await (await fetch(new URL("../dist-wasm/zlib-module.wasm", import.meta.url))).arrayBuffer();

initModule(moduleCode, wasmBinary);

export { CompressionStream, DecompressionStream };
