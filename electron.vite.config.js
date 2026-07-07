import { defineConfig } from "electron-vite";
import { resolve } from "path";

export default defineConfig({
	main: {
		build: {
			outDir: "out/main",
			rollupOptions: {
				external: ["electron", "exiftool-vendored", "sharp"],
			},
		},
		resolve: {
			alias: {
				"@": resolve(__dirname, "src/main"),
			},
		},
	},
	preload: {
		build: {
			outDir: "out/preload",
			rollupOptions: {
				output: {
					format: "cjs",
					entryFileNames: "[name].js",
				},
			},
		},
	},
	renderer: {
		root: resolve(__dirname, "src/renderer"),
		build: {
			outDir: resolve(__dirname, "out/renderer"),
			rollupOptions: {
				input: resolve(__dirname, "src/renderer/index.html"),
			},
		},
	},
});
