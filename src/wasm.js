const moduleResponse = await fetch(new URL('../dist-wasm/zlib-module.js', import.meta.url));
const moduleCode = await moduleResponse.text();
const ZlibModule = new Function(moduleCode + '; return ZlibModule;')();

export default async function (moduleArg = {}) {
	const config = {
		locateFile: (path, _scriptDirectory) => {
			if (path === 'zlib-module.wasm') {
				return new URL('../dist-wasm/zlib-module.wasm', import.meta.url).href;
			}
			return path;
		},
		...moduleArg
	};
	if (!config.wasmBinary) {
		try {
			const wasmUrl = new URL('../dist-wasm/zlib-module.wasm', import.meta.url);
			const wasmResponse = await fetch(wasmUrl);
			if (wasmResponse.ok) {
				config.wasmBinary = await wasmResponse.arrayBuffer();
			}
		} catch (err) {
			console.warn('Could not fetch WASM file directly, falling back to locateFile:', err.message);
		}
	}

	return ZlibModule(config);
}
