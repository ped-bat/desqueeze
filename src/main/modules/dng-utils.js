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
import { exec } from "child_process";
import fs from "fs/promises";
import { exiftool } from "exiftool-vendored";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execAsync = promisify(exec);

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
	} catch {
		throw new Error(`DNGLab binary not found at: ${dnglabPath}`);
	}
}

// ============================================================================
// Command Execution
// ============================================================================

/**
 * Run a DNGLab command
 * @param {string} command - Full command string to execute
 * @returns {Promise<{stdout: string, stderr: string}>}
 */
async function runDNGLabCommand(command) {
	console.log("Running:", command);

	const { stdout, stderr } = await execAsync(command, {
		maxBuffer: 10 * 1024 * 1024,
	});

	if (stderr) console.log("DNGLab stderr:", stderr);
	if (stdout) console.log("DNGLab stdout:", stdout);

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
	const dnglabPath = await verifyDNGLabBinary();

	const command = `"${dnglabPath}" convert --embed-raw false --dng-preview true --override "${inputPath}" "${outputPath}"`;

	await runDNGLabCommand(command);

	// Verify output was created
	try {
		await fs.access(outputPath);
		console.log("DNG file created:", outputPath);
		return outputPath;
	} catch {
		throw new Error(`DNG file was not created at: ${outputPath}`);
	}
}

/**
 * Convert bitmap to DNG using DNGLab makedng
 * @param {string} inputPath - Path to input bitmap file
 * @param {string} outputPath - Path for output DNG file
 * @param {string} command - Pre-built command from command-builder
 * @returns {Promise<string>} Path to created DNG file
 */
async function convertBitmapToDNG(inputPath, outputPath, command) {
	await runDNGLabCommand(command);

	// Verify output was created
	try {
		await fs.access(outputPath);
		console.log("DNG file created:", outputPath);
		return outputPath;
	} catch {
		throw new Error(`DNG file was not created at: ${outputPath}`);
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
	console.log(`Setting DefaultScale to ${ratioX} ${ratioY}...`);
	await exiftool.write(dngPath, { DefaultScale: `${ratioX} ${ratioY}` }, [
		"-overwrite_original",
	]);
	console.log("DefaultScale applied successfully");
}

/**
 * Copy metadata from source file to DNG, preserving DNG-specific tags
 * @param {string} sourcePath - Original file to copy metadata from
 * @param {string} dngPath - DNG file to write metadata to
 * @param {string[]} preserveTags - Tags to preserve in DNG (not overwrite)
 */
async function copyMetadataToDNG(sourcePath, dngPath, preserveTags = ["DefaultScale"]) {
	console.log("Copying metadata from original file...");

	const excludeArgs = preserveTags.map((tag) => `--${tag}`);

	await exiftool.write(dngPath, {}, [
		"-overwrite_original",
		"-TagsFromFile",
		sourcePath,
		"-all:all",
		...excludeArgs,
	]);

	console.log("Metadata copied successfully");
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
