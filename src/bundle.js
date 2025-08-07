import { CompressionStream, DecompressionStream, initModule } from "./mod.js";
import wasmBase64 from "../dist-wasm/zlib-module.wasm?embed";
import moduleCode from "../dist-wasm/zlib-module.js?raw";

const wasmBinary = Uint8Array.from(atob(wasmBase64), (c) => c.charCodeAt(0));
initModule(moduleCode, wasmBinary);

export { CompressionStream, DecompressionStream };
