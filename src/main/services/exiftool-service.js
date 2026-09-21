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
	 * @param {string[]} [readArgs=[]] - Extra exiftool arguments, e.g. "-G1" to
	 *   prefix keys with their IFD group, "-a" to keep duplicate tags
	 * @returns {Promise<Object>} EXIF data
	 */
	async read(filePath, readArgs = []) {
		return readArgs.length
			? this._exiftool.read(filePath, { readArgs })
			: this._exiftool.read(filePath);
	}

	/**
	 * Extract the embedded preview JPEG from a raw or DNG file.
	 * @param {string} filePath - Source image
	 * @param {string} destPath - Where to write the JPEG
	 * @returns {Promise<boolean>} false when the file carries no preview
	 */
	async extractPreview(filePath, destPath) {
		// Resolves to undefined on success and to exiftool's status line when
		// the tag is absent — the library deliberately doesn't throw there.
		const status = await this._exiftool.extractPreview(filePath, destPath);
		return status == null;
	}

	/**
	 * Write EXIF metadata to a file
	 * @param {string} filePath - Path to the image file
	 * @param {Object} tags - Tags to write
	 * @param {string[]} [args=[]] - Additional exiftool arguments
	 */
	async write(filePath, tags, args = []) {
		// The bare-array overload is deprecated upstream; writeArgs is the
		// supported form and keeps working across major versions.
		return this._exiftool.write(filePath, tags, { writeArgs: args });
	}

	/**
	 * Version of the bundled exiftool, for the diagnostic report.
	 * @returns {Promise<string>}
	 */
	async version() {
		return this._exiftool.version();
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
