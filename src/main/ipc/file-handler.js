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
import { getFilesFromDirectory, isInsideOutputDir } from "../utils/file-utils.js";

class FileHandler {
	/**
	 * @param {import("electron").BrowserWindow} win - Main browser window
	 */
	constructor(win) {
		this._win = win;
	}

	/**
	 * Show a file/directory selection dialog and return selected file paths.
	 * @returns {Promise<string[]|null>}
	 */
	async selectFiles() {
		const result = await dialog.showOpenDialog(this._win, {
			properties: ["openFile", "openDirectory", "multiSelections"],
			filters: [
				{ name: "Supported Images", extensions: AppConfig.EXTENSIONS_LIST },
				{ name: "All Files", extensions: ["*"] },
			],
		});

		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}

		const allFiles = await this._expandPaths(result.filePaths);
		return allFiles.length > 0 ? allFiles : null;
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
	 * Filter out files that have already been desqueezed (carry the output suffix).
	 * Only the app's own naming is matched — a stem *ending* in "-desqueezed"
	 * or "-desqueezed-N" — so user files that merely contain the word
	 * (e.g. "beach-desqueezed-final.jpg") are not silently skipped.
	 * The skipped paths are returned alongside the count so the renderer can
	 * list them as already-desqueezed rows instead of dropping them silently.
	 * @param {string[]} filePaths
	 * @returns {{ toProcess: string[], skipped: string[], skippedCount: number }}
	 */
	filterDesqueezed(filePaths) {
		const suffixPattern = new RegExp(`${AppConfig.OUTPUT_SUFFIX}(-\\d+)?$`, "i");
		const toProcess = [];
		const skipped = [];
		for (const fp of filePaths) {
			const stem = path.basename(fp, path.extname(fp));
			(suffixPattern.test(stem) ? skipped : toProcess).push(fp);
		}
		return { toProcess, skipped, skippedCount: skipped.length };
	}

	/**
	 * Expand a list of paths (may be files or directories) into supported files.
	 * Anything inside the app's output directory is excluded.
	 * @param {string[]} paths
	 * @returns {Promise<string[]>}
	 */
	async _expandPaths(paths) {
		const allFiles = [];

		for (const selectedPath of paths) {
			try {
				const stat = await fs.stat(selectedPath);
				if (stat.isDirectory()) {
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

		return allFiles.filter((fp) => !isInsideOutputDir(fp));
	}
}

export { FileHandler };
