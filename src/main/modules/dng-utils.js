/**
 * DNG Utilities - Common operations for DNG files
 *
 * Provides reusable functions for:
 * - Getting DNGLab binary path
 * - Running DNGLab commands
 * - Stretching DNG files (DefaultScale)
 * - Converting RAW to DNG
 */

import path from "path";
import { app } from "electron";
import { promisify } from "util";
import { execFile } from "child_process";
import fs from "fs/promises";
import { exiftool } from "exiftool-vendored";
import { fileURLToPath } from "url";
import log from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFileAsync = promisify(execFile);

// ============================================================================
// Path Utilities
// ============================================================================

/**
 * Get the path to the bundled DNGLab binary
 * @returns {string} Absolute path to dnglab binary
 */
function getDNGLabPath() {
	const platform = process.platform;
	const binaryName = platform === "win32" ? "dnglab.exe" : "dnglab";
	const basePath = app.isPackaged
		? process.resourcesPath
		: path.join(__dirname, "../..");

	return path.join(
		basePath,
		app.isPackaged ? "bin" : "resources/bin",
		platform,
		binaryName
	);
}

/**
 * Verify that DNGLab binary exists and is accessible
 * @throws {Error} If binary not found
 */
async function verifyDNGLabBinary() {
	const dnglabPath = getDNGLabPath();
	try {
		await fs.access(dnglabPath);
		return dnglabPath;
	} catch (error) {
		log.error(`DNGLab binary check failed: ${error.message}`);
		throw new Error(`DNGLab binary not found at: ${dnglabPath}`);
	}
}

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Run a DNGLab command
 * @param {string[]} args - Command arguments
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function runDNGLabCommand(args) {
	const dnglabPath = await verifyDNGLabBinary();
	log.info("Running DNGLab:", args.join(" "));

	const { stdout, stderr } = await execFileAsync(dnglabPath, args, {
		maxBuffer: 10 * 1024 * 1024,
	});

	if (stderr) log.warn("DNGLab stderr:", stderr);
	if (stdout) log.info("DNGLab stdout:", stdout);

	return { stdout, stderr };
}

// ============================================================================
// DNG Operations
// ============================================================================

/**
 * Convert RAW file to DNG using DNGLab
 * @param {string} inputPath - Path to input RAW file
 * @param {string} outputPath - Path for output DNG file
 * @returns {Promise<string>} Path to created DNG file
 */
async function convertRAWToDNG(inputPath, outputPath) {
	const args = [
		"convert",
		"--dng-preview", "true",
		"--override",
		inputPath,
		outputPath
	];

	await runDNGLabCommand(args);

	// Verify output was created
	try {
		await fs.access(outputPath);
		log.info("DNG file created:", outputPath);
		return outputPath;
	} catch (error) {
		log.error(`Failed to verify DNG creation: ${error.message}`);
		throw new Error(`DNG file was not created at: ${outputPath}. Check logs for details.`);
	}
}

/**
 * Convert bitmap to DNG using DNGLab makedng
 * @param {string} inputPath - Path to input bitmap file
 * @param {string} outputPath - Path for output DNG file
 * @param {string[]} commandArgs - Pre-built command arguments from command-builder
 * @returns {Promise<string>} Path to created DNG file
 */
async function convertBitmapToDNG(inputPath, outputPath, commandArgs) {
	await runDNGLabCommand(commandArgs);

	// Verify output was created
	try {
		await fs.access(outputPath);
		log.info("DNG file created:", outputPath);
		return outputPath;
	} catch (error) {
		log.error(`Failed to verify DNG creation: ${error.message}`);
		throw new Error(`DNG file was not created at: ${outputPath}. Check logs for details.`);
	}
}

/**
 * Set DefaultScale metadata on a DNG file for desqueezing
 * This is reusable by both RAW and bitmap workflows
 * @param {string} dngPath - Path to DNG file
 * @param {number} ratioX - Horizontal ratio component
 * @param {number} ratioY - Vertical ratio component
 */
async function stretchDNG(dngPath, ratioX, ratioY) {
	log.info(`Setting DefaultScale to ${ratioX} ${ratioY}...`);
	await exiftool.write(dngPath, { DefaultScale: `${ratioX} ${ratioY}` }, [
		"-overwrite_original",
	]);
	log.info("DefaultScale applied successfully");
}

/**
 * Copy metadata from source file to DNG, preserving DNG-specific tags
 * @param {string} sourcePath - Original file to copy metadata from
 * @param {string} dngPath - DNG file to write metadata to
 * @param {string[]} preserveTags - Tags to preserve in DNG (not overwrite)
 */
async function copyMetadataToDNG(sourcePath, dngPath, preserveTags = ["DefaultScale"]) {
	log.info("Copying metadata from original file...");

	const excludeArgs = preserveTags.map((tag) => `--${tag}`);

	// Copy all metadata, including maker notes which contain camera processing info
	await exiftool.write(dngPath, {}, [
		"-overwrite_original",
		"-TagsFromFile",
		sourcePath,
		"-all:all",
		"-unsafe",  // Include maker notes (camera-specific processing)
		...excludeArgs,
	]);

	log.info("Metadata copied successfully");
}

export {
	getDNGLabPath,
	verifyDNGLabBinary,
	runDNGLabCommand,
	convertRAWToDNG,
	convertBitmapToDNG,
	stretchDNG,
	copyMetadataToDNG,
};
