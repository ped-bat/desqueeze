/**
 * Validation - Input validation utilities
 *
 * Centralizes all input validation logic so it can be reused
 * across processors, IPC handlers, and services.
 */

import { AppConfig } from "../config.js";

/**
 * Validate that a file path is a non-empty string.
 * @param {*} filePath
 * @throws {Error} If invalid
 */
function validateFilePath(filePath) {
	if (typeof filePath !== "string" || filePath.trim() === "") {
		throw new Error("File path must be a non-empty string.");
	}
}

/**
 * Validate desqueeze ratio values.
 * @param {number} ratioX - Horizontal ratio
 * @param {number} ratioY - Vertical ratio
 * @throws {Error} If invalid
 */
function validateRatios(ratioX, ratioY) {
	if (typeof ratioX !== "number" || !isFinite(ratioX) || ratioX <= 0) {
		throw new Error(`Invalid horizontal ratio: ${ratioX}. Must be a positive number.`);
	}
	if (typeof ratioY !== "number" || !isFinite(ratioY) || ratioY <= 0) {
		throw new Error(`Invalid vertical ratio: ${ratioY}. Must be a positive number.`);
	}

	const stretchFactor = ratioX / ratioY;
	const maxStretch = AppConfig.MAX_STRETCH_FACTOR;
	if (stretchFactor > maxStretch) {
		throw new Error(
			`Stretch factor ${stretchFactor.toFixed(2)} exceeds maximum of ${maxStretch}.`
		);
	}
}

export { validateFilePath, validateRatios };
