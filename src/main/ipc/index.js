/**
 * IPC Registry - Registers all IPC handlers on the main process
 *
 * Thin coordination layer that wires IPC channels to their handlers.
 * Each handler class owns its own domain logic.
 */

import { ipcMain } from "electron";
import { AppConfig } from "../config.js";
import { FileHandler } from "./file-handler.js";
import { ProcessHandler } from "./process-handler.js";

class IpcRegistry {
	/**
	 * @param {import("electron").BrowserWindow} win
	 * @param {import("../processors/desqueeze-processor.js").DesqueezeProcessor} processor
	 */
	constructor(win, processor) {
		this._fileHandler = new FileHandler(win);
		this._processHandler = new ProcessHandler(win, processor);
	}

	/**
	 * Register all IPC handlers. Call this once after the window is created.
	 */
	register() {
		// Renderer configuration (limits, defaults, output formats)
		ipcMain.handle("get-config", () => AppConfig.RENDERER_CONFIG);

		// File selection dialog
		ipcMain.handle("select-image-file", () => {
			return this._fileHandler.selectFiles();
		});

		// Main desqueeze processing
		ipcMain.handle("desqueeze-file", (event, filePath, ratioX, ratioY, outputOpts) => {
			return this._processHandler.desqueezeFile(filePath, ratioX, ratioY, outputOpts);
		});

		// Error dialog
		ipcMain.handle("show-error-dialog", (event, title, message) => {
			return this._processHandler.showErrorDialog(title, message);
		});

		// Expand dropped paths (files + directories → flat file list)
		ipcMain.handle("expand-dropped-paths", (event, paths) => {
			return this._fileHandler.expandDroppedPaths(paths);
		});

		// Filter out already-desqueezed files
		ipcMain.handle("filter-desqueezed", (event, filePaths) => {
			return this._fileHandler.filterDesqueezed(filePaths);
		});
	}
}

export { IpcRegistry };
