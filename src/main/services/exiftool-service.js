/**
 * ExifToolService - Centralized ExifTool lifecycle management
 *
 * Singleton wrapper around exiftool-vendored that owns the ExifTool
 * process lifecycle. All modules should use this service instead of
 * importing exiftool-vendored directly.
 */

import { exiftool } from "exiftool-vendored";
import log from "../logger.js";

class ExifToolService {
	static #instance = null;

	/** @returns {ExifToolService} */
	static getInstance() {
		if (!ExifToolService.#instance) {
			ExifToolService.#instance = new ExifToolService();
		}
		return ExifToolService.#instance;
	}

	constructor() {
		if (ExifToolService.#instance) {
			throw new Error("Use ExifToolService.getInstance() instead of new.");
		}
		this._exiftool = exiftool;
	}

	/**
	 * Read EXIF metadata from a file
	 * @param {string} filePath - Path to the image file
	 * @returns {Promise<Object>} EXIF data
	 */
	async read(filePath) {
		return this._exiftool.read(filePath);
	}

	/**
	 * Write EXIF metadata to a file
	 * @param {string} filePath - Path to the image file
	 * @param {Object} tags - Tags to write
	 * @param {string[]} [args=[]] - Additional exiftool arguments
	 */
	async write(filePath, tags, args = []) {
		return this._exiftool.write(filePath, tags, args);
	}

	/**
	 * Gracefully shut down the exiftool process.
	 * Should only be called once during app quit.
	 */
	async shutdown() {
		try {
			await this._exiftool.end();
			log.info("ExifTool process ended gracefully.");
		} catch (error) {
			log.warn(`ExifTool shutdown warning: ${error.message}`);
		}
	}
}

export { ExifToolService };
