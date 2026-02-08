/**
 * FileHandler - IPC handler for file selection, path expansion, and filtering
 *
 * Owns the "select-image-file", "expand-dropped-paths", and
 * "filter-desqueezed" IPC channels.
 */

import { dialog } from "electron";
import path from "path";
import fs from "fs/promises";
import log from "../logger.js";
import { AppConfig } from "../config.js";
import { getFilesFromDirectory } from "../utils/file-utils.js";

class FileHandler {
	/**
	 * @param {import("electron").BrowserWindow} win - Main browser window
	 */
	constructor(win) {
		this._win = win;
	}

	/**
	 * Show a file/directory selection dialog and return selected file paths.
	 * @returns {Promise<string[]|string|null>}
	 */
	async selectFiles() {
		const properties = AppConfig.PREMIUM
			? ["openFile", "openDirectory", "multiSelections"]
			: ["openFile"];

		const result = await dialog.showOpenDialog(this._win, {
			properties,
			filters: [
				{ name: "Supported Images", extensions: AppConfig.EXTENSIONS_LIST },
				{ name: "All Files", extensions: ["*"] },
			],
		});

		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}

		if (AppConfig.PREMIUM) {
			const allFiles = await this._expandPaths(result.filePaths);
			return allFiles.length > 0 ? allFiles : null;
		}

		return result.filePaths[0];
	}

	/**
	 * Expand an array of paths (files and directories) into a flat list of supported files.
	 * @param {string[]} paths
	 * @returns {Promise<string[]>}
	 */
	async expandDroppedPaths(paths) {
		if (!Array.isArray(paths)) {
			log.error("expandDroppedPaths received non-array input.");
			return [];
		}
		return this._expandPaths(paths);
	}

	/**
	 * Filter out files that have already been desqueezed (contain "-desqueezed" in name).
	 * @param {string[]} filePaths
	 * @returns {{ toProcess: string[], skippedCount: number }}
	 */
	filterDesqueezed(filePaths) {
		const toProcess = [];
		const skipped = [];

		for (const fp of filePaths) {
			const name = path.basename(fp).toLowerCase();
			if (name.includes("-desqueezed")) {
				skipped.push(fp);
			} else {
				toProcess.push(fp);
			}
		}

		return { toProcess, skippedCount: skipped.length };
	}

	/**
	 * Expand a list of paths (may be files or directories) into supported files.
	 * @param {string[]} paths
	 * @returns {Promise<string[]>}
	 */
	async _expandPaths(paths) {
		const allFiles = [];

		for (const selectedPath of paths) {
			try {
				const stat = await fs.stat(selectedPath);
				if (stat.isDirectory()) {
					// Skip the app's output directory entirely
					if (path.basename(selectedPath).toLowerCase() === "desqueezed") {
						continue;
					}
					const dirFiles = await getFilesFromDirectory(
						selectedPath,
						AppConfig.ALL_FORMATS
					);
					allFiles.push(...dirFiles);
				} else if (
					stat.isFile() &&
					AppConfig.ALL_FORMATS.has(path.extname(selectedPath).toLowerCase())
				) {
					allFiles.push(selectedPath);
				}
			} catch (err) {
				log.error(`Error processing path ${selectedPath}: ${err.message}`);
			}
		}

		// Exclude any files that live inside a desqueezed/ directory
		return allFiles.filter((fp) => {
			const parts = fp.split(path.sep);
			return !parts.includes("desqueezed");
		});
	}
}

export { FileHandler };
