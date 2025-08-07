import { defineConfig } from "vite";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { readFile } from "node:fs/promises";
import terser from "@rollup/plugin-terser";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

// Custom plugin to embed WASM as base64 and JS as raw text
function wasmEmbedPlugin() {
	return {
		name: "wasm-embed",
		load(id) {
			if (id.endsWith(".wasm?embed")) {
				return readFile(id.replace("?embed", "")).then((buffer) => {
					const base64 = buffer.toString("base64");
					return `export default "${base64}";`;
				});
			}
			if (id.endsWith(".js?raw")) {
				return readFile(id.replace("?raw", ""), "utf8").then((content) => {
					const minifiedContent = terser().transform(content, {
						compress: { drop_console: true },
						mangle: true,
					}).code.replace(/\s+/g, " ");
					return "export default " + JSON.stringify(minifiedContent) + ";";
				});
			}
		},
	};
}

export default defineConfig({
	plugins: [wasmEmbedPlugin()],
	build: {
		lib: {
			entry: resolve(__dirname, "src/bundle.js"),
			name: "Zlib",
			fileName: "zlib",
		},
		rollupOptions: {
			output: [
				{
					format: "es",
					entryFileNames: "zlib.js",
					inlineDynamicImports: true,
				},
				{
					format: "es",
					entryFileNames: "zlib.min.js",
					inlineDynamicImports: true,
					plugins: [terser()],
				},
			],
		},
		outDir: "dist",
		minify: false, // We handle minification in the output config
		sourcemap: true,
	},
	define: {
		global: "globalThis",
	},
});
