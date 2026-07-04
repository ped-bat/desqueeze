/**
 * File Utilities - Path helpers and temporary file management
 */

import path from "path";
import fs from "fs/promises";
import os from "os";
import crypto from "crypto";
import log from "../logger.js";
import { AppConfig } from "../config.js";

/**
 * Tracks which input file each output path was issued to, so that two
 * different inputs (e.g. foo.jpg and foo.png exported to JPEG) never
 * silently overwrite each other. Re-processing the same input reuses
 * its path (overwrite is intentional there). Keys are lowercased because
 * macOS filesystems are case-insensitive.
 * @type {Map<string, string>} lowercased outputPath -> lowercased inputPath
 */
const outputClaims = new Map();

/**
 * Create output directory and return the output file path.
 * @param {string} filePath - Original file path
 * @param {string} ext - Original file extension (e.g., ".jpg")
 * @param {string} [outputExt=ext] - Desired output extension (e.g., ".dng")
 * @returns {Promise<string>} Absolute output file path
 */
async function getOutputPath(filePath, ext, outputExt = ext) {
	const dir = path.dirname(filePath);
	const outputDir = path.join(dir, AppConfig.OUTPUT_DIR_NAME);
	await fs.mkdir(outputDir, { recursive: true });

	// Use the actual extension from the filename (preserves original casing)
	// so path.basename() can strip it correctly (it's case-sensitive)
	const actualExt = path.extname(filePath);
	const baseName = path.basename(filePath, actualExt);

	const inputKey = filePath.toLowerCase();
	let candidate = path.join(outputDir, `${baseName}${AppConfig.OUTPUT_SUFFIX}${outputExt}`);
	for (
		let i = 1;
		outputClaims.has(candidate.toLowerCase()) && outputClaims.get(candidate.toLowerCase()) !== inputKey;
		i++
	) {
		candidate = path.join(outputDir, `${baseName}${AppConfig.OUTPUT_SUFFIX}-${i}${outputExt}`);
	}
	outputClaims.set(candidate.toLowerCase(), inputKey);
	return candidate;
}

/**
 * Create a unique temporary file path in the OS temp directory.
 * The random suffix prevents collisions between concurrent jobs.
 * @param {string} [extension=".png"] - File extension
 * @returns {string} Temporary file path
 */
function getTempFilePath(extension = ".png") {
	const unique = `${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
	return path.join(os.tmpdir(), `desqueeze-${unique}${extension}`);
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
 * Check whether a path is the app's output directory or lives inside one.
 * @param {string} somePath - File or directory path
 * @returns {boolean}
 */
function isInsideOutputDir(somePath) {
	return somePath
		.split(path.sep)
		.some((part) => part.toLowerCase() === AppConfig.OUTPUT_DIR_NAME);
}

/**
 * Recursively get all files in a directory matching the given extensions.
 * The app's output directories ("desqueezed") are skipped.
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
			if (entry.name.toLowerCase() === AppConfig.OUTPUT_DIR_NAME) {
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
	isInsideOutputDir,
	getFilesFromDirectory,
};
