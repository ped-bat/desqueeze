/**
 * File Utilities - Path helpers and temporary file management
 */

import path from "path";
import fs from "fs/promises";
import { existsSync } from "fs";
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
	// A candidate is taken when another input claimed it this session, or a
	// file from a previous run already exists on disk. Re-processing the same
	// input this session reuses its path (overwrite is intentional there).
	// existsSync keeps the check-and-claim atomic — an await between the
	// check and the set would let two concurrent jobs claim the same path.
	let candidate;
	for (let i = 0; ; i++) {
		const suffix = i === 0 ? AppConfig.OUTPUT_SUFFIX : `${AppConfig.OUTPUT_SUFFIX}-${i}`;
		candidate = path.join(outputDir, `${baseName}${suffix}${outputExt}`);
		const claimedBy = outputClaims.get(candidate.toLowerCase());
		if (claimedBy === inputKey) break;
		if (!claimedBy && !existsSync(candidate)) break;
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
		// A file that was never created isn't a cleanup failure
		if (e.code !== "ENOENT") {
			log.warn(`Failed to clean up temp file ${filePath}: ${e.message}`);
		}
	}
}

/**
 * Check whether a file lives directly inside an app output directory.
 * Only the immediate parent is checked — the app never nests output —
 * so a user's own folder that happens to be named "desqueezed" higher
 * up the tree doesn't exclude everything beneath it.
 * @param {string} somePath - File path
 * @returns {boolean}
 */
function isInsideOutputDir(somePath) {
	return (
		path.basename(path.dirname(somePath)).toLowerCase() ===
		AppConfig.OUTPUT_DIR_NAME
	);
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
	let entries;
	try {
		entries = await fs.readdir(dirPath, { withFileTypes: true });
	} catch (err) {
		// One unreadable subdirectory shouldn't discard the whole tree
		log.warn(`Skipping unreadable directory ${dirPath}: ${err.message}`);
		return [];
	}

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
