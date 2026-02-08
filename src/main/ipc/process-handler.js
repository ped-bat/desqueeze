/**
 * ProcessHandler - IPC handler for desqueeze processing and error dialogs
 *
 * Owns the "desqueeze-file" and "show-error-dialog" IPC channels.
 */

import { dialog } from "electron";
import log from "../logger.js";
import { DesqueezeProcessor } from "../processors/desqueeze-processor.js";

class ProcessHandler {
	/**
	 * @param {import("electron").BrowserWindow} win - Main browser window
	 * @param {DesqueezeProcessor} processor - The desqueeze processor instance
	 */
	constructor(win, processor) {
		this._win = win;
		this._processor = processor;
	}

	/**
	 * Process a single file through the desqueeze pipeline.
	 * @param {string} filePath
	 * @param {number} ratioX
	 * @param {number} ratioY
	 * @param {{ format?: string, options?: object }} [outputOpts] - Output format options
	 * @returns {Promise<Object>} Result object with success/error
	 */
	async desqueezeFile(filePath, ratioX, ratioY, outputOpts) {
		log.info(`Request to desqueeze: ${filePath} (${ratioX}×${ratioY}) → ${outputOpts?.format || "dng"}`);

		try {
			const outputPath = await this._processor.process(filePath, ratioX, ratioY, outputOpts);
			log.info(`Desqueeze successful: ${outputPath}`);
			return {
				success: true,
				originalFile: filePath,
				outputFile: outputPath,
			};
		} catch (error) {
			log.error(`Desqueeze failed for ${filePath}: ${error.message}`);
			return {
				success: false,
				error: error.message,
			};
		}
	}

	/**
	 * Show a native error dialog.
	 * @param {string} title
	 * @param {string} message
	 */
	async showErrorDialog(title, message) {
		await dialog.showMessageBox(this._win, {
			type: "error",
			title,
			message,
			buttons: ["OK"],
		});
	}
}

export { ProcessHandler };
