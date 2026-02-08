/**
 * File Utilities - Path helpers and temporary file management
 */

import path from "path";
import fs from "fs/promises";
import os from "os";
import log from "../logger.js";

/**
 * Create output directory and return the output file path.
 * @param {string} filePath - Original file path
 * @param {string} ext - Original file extension (e.g., ".jpg")
 * @param {string} [outputExt=ext] - Desired output extension (e.g., ".dng")
 * @returns {Promise<string>} Absolute output file path
 */
async function getOutputPath(filePath, ext, outputExt = ext) {
	const dir = path.dirname(filePath);
	const outputDir = path.join(dir, "desqueezed");
	await fs.mkdir(outputDir, { recursive: true });

	// Use the actual extension from the filename (preserves original casing)
	// so path.basename() can strip it correctly (it's case-sensitive)
	const actualExt = path.extname(filePath);
	const baseName = path.basename(filePath, actualExt);
	return path.join(outputDir, `${baseName}-desqueezed${outputExt}`);
}

/**
 * Create a temporary file path in the OS temp directory.
 * @param {string} [extension=".png"] - File extension
 * @returns {string} Temporary file path
 */
function getTempFilePath(extension = ".png") {
	return path.join(os.tmpdir(), `desqueeze-${Date.now()}${extension}`);
}

/**
 * Safely delete a file, logging a warning on failure.
 * @param {string} filePath - Path to delete
 */
async function safeUnlink(filePath) {
	try {
		await fs.unlink(filePath);
		log.info(`Cleaned up temp file: ${filePath}`);
	} catch (e) {
		log.warn(`Failed to clean up temp file ${filePath}: ${e.message}`);
	}
}

/**
 * Verify that a file exists at the given path.
 * @param {string} filePath - Path to check
 * @throws {Error} If file does not exist
 */
async function verifyFileExists(filePath) {
	try {
		await fs.access(filePath);
	} catch {
		throw new Error(`File does not exist: ${filePath}`);
	}
}

/**
 * Directories to skip when recursively scanning for files.
 * The "desqueezed" folder is the app's output directory and should never be re-processed.
 */
const SKIP_DIRECTORIES = new Set(["desqueezed"]);

/**
 * Recursively get all files in a directory matching the given extensions.
 * @param {string} dirPath - Directory to scan
 * @param {Set<string>} extensions - Allowed extensions (e.g., new Set([".jpg", ".png"]))
 * @param {number} [maxDepth=20] - Maximum recursion depth to prevent infinite loops
 * @returns {Promise<string[]>} Array of matching file paths
 */
async function getFilesFromDirectory(dirPath, extensions, maxDepth = 20) {
	if (maxDepth <= 0) {
		log.warn(`Max recursion depth reached at: ${dirPath}`);
		return [];
	}

	const files = [];
	const entries = await fs.readdir(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);

		if (entry.isDirectory()) {
			if (SKIP_DIRECTORIES.has(entry.name.toLowerCase())) {
				continue;
			}
			const subFiles = await getFilesFromDirectory(fullPath, extensions, maxDepth - 1);
			files.push(...subFiles);
		} else if (entry.isFile()) {
			const ext = path.extname(entry.name).toLowerCase();
			if (extensions.has(ext)) {
				files.push(fullPath);
			}
		}
	}

	return files;
}

export {
	getOutputPath,
	getTempFilePath,
	safeUnlink,
	verifyFileExists,
	getFilesFromDirectory,
};
