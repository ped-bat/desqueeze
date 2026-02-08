/**
 * BaseProcessor - Abstract base class for file processors
 *
 * Defines the contract that all processors must implement.
 * Each processor handles a specific category of image files
 * (RAW, Bitmap, etc.) through the desqueeze pipeline.
 */

import log from "../logger.js";
import { getOutputPath } from "../utils/file-utils.js";

/**
 * @typedef {Object} OutputOptions
 * @property {string}  format  - Output format key (e.g. "dng", "jpg", "png", "tiff", "webp")
 * @property {string}  ext     - Output file extension (e.g. ".dng", ".jpg")
 * @property {object}  options - Format-specific options (quality, compression, etc.)
 */

class BaseProcessor {
	/**
	 * @param {Object} deps - Shared dependencies
	 * @param {import("./dng-operations.js").DngOperations} deps.dngOps
	 */
	constructor(deps) {
		if (new.target === BaseProcessor) {
			throw new Error("BaseProcessor is abstract and cannot be instantiated directly.");
		}
		this._dngOps = deps.dngOps;
	}

	/**
	 * Process a file through the desqueeze pipeline.
	 * Subclasses must implement this method.
	 *
	 * @param {string} filePath - Input file path
	 * @param {string} ext - File extension (lowercase, with dot)
	 * @param {number} ratioX - Horizontal stretch ratio
	 * @param {number} ratioY - Vertical stretch ratio
	 * @param {OutputOptions} outputOpts - Output format configuration
	 * @returns {Promise<string>} Output file path
	 * @abstract
	 */
	async process(filePath, ext, ratioX, ratioY, outputOpts) {
		throw new Error("Subclasses must implement process().");
	}

	/**
	 * Helper: get the output path for a processed file.
	 * @param {string} filePath
	 * @param {string} ext
	 * @param {string} [outputExt]
	 * @returns {Promise<string>}
	 */
	async _getOutputPath(filePath, ext, outputExt) {
		return getOutputPath(filePath, ext, outputExt);
	}
}

export { BaseProcessor };
