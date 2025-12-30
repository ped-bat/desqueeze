import { defineConfig } from "electron-vite";
import tailwindcss from "@tailwindcss/vite";
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
		},
	},
	renderer: {
		root: resolve(__dirname, "src/renderer"),
		plugins: [tailwindcss()],
		build: {
			outDir: resolve(__dirname, "out/renderer"),
			rollupOptions: {
				input: resolve(__dirname, "src/renderer/index.html"),
			},
		},
	},
});
