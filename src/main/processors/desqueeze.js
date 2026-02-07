/**
 * Desqueeze Processor - Main orchestrator for file processing
 *
 * Routes files to appropriate processing workflow (RAW or Bitmap)
 * and uses modular components for each step.
 */

import path from "path";
import fs from "fs/promises";
import os from "os";
import sharp from "sharp";
import { RAW_FORMATS, BITMAP_FORMATS } from "../config.js";
import log from "../logger.js";

// Import modules
import {
	ImageAnalyzer,
	convertRAWToDNG,
	convertBitmapToDNG,
	stretchDNG,
	copyMetadataToDNG,
	buildMakeDNGCommand,
} from "../modules/index.js";

// ============================================================================
// Output Path Utilities
// ============================================================================

/**
 * Create output directory and return output file path
 * @param {string} filePath - Original file path
 * @param {string} ext - Original file extension
 * @param {string} outputExt - Desired output extension
 * @returns {Promise<string>} Output file path
 */
async function getOutputPath(filePath, ext, outputExt = ext) {
	const dir = path.dirname(filePath);
	const outputDir = path.join(dir, "desqueezed");
	await fs.mkdir(outputDir, { recursive: true });

	const baseName = path.basename(filePath, ext);
	return path.join(outputDir, `${baseName}-desqueezed${outputExt}`);
}

// ============================================================================
// RAW Processing
// ============================================================================

/**
 * Process RAW files: Convert to DNG + apply DefaultScale
 * @param {string} filePath - Input RAW file path
 * @param {string} ext - File extension
 * @param {number} ratioX - Horizontal stretch ratio
 * @param {number} ratioY - Vertical stretch ratio
 * @returns {Promise<string>} Output DNG path
 */
async function processRAW(filePath, ext, ratioX, ratioY) {
	const outputPath = await getOutputPath(filePath, ext, ".dng");

	// Convert to DNG (or copy if already DNG)
	if (ext !== ".dng") {
		log.info("Converting RAW to DNG...");
		await convertRAWToDNG(filePath, outputPath);
	} else {
		await fs.copyFile(filePath, outputPath);
	}

	// Apply stretch via DefaultScale
	await stretchDNG(outputPath, ratioX, ratioY);

	log.info("RAW processed:", outputPath);
	return outputPath;
}

// ============================================================================
// Bitmap Processing
// ============================================================================

/**
 * Process Bitmap files: Analyze → Convert to DNG → Apply DefaultScale
 * @param {string} filePath - Input bitmap file path
 * @param {string} ext - File extension
 * @param {number} ratioX - Horizontal stretch ratio
 * @param {number} ratioY - Vertical stretch ratio
 * @returns {Promise<string>} Output DNG path
 */
async function processBitmap(filePath, ext, ratioX, ratioY) {
	const outputPath = await getOutputPath(filePath, ext, ".dng");

	// Step 1: Analyze the image
	log.info("Analyzing bitmap...");
	const analyzer = new ImageAnalyzer(filePath);
	const metadata = await analyzer.analyze();
	analyzer.printSummary();

	// Step 2: Pre-process if image has alpha channel (dnglab doesn't support RGBA)
	let inputForDNG = filePath;
	let tempFile = null;
	
	if (metadata.hasAlpha) {
		log.info("Image has alpha channel - converting to RGB...");
		tempFile = path.join(os.tmpdir(), `desqueeze-${Date.now()}.png`);
		await sharp(filePath)
			.flatten({ background: { r: 255, g: 255, b: 255 } }) // White background
			.toFile(tempFile);
		inputForDNG = tempFile;
		log.info("Temporary RGB file created:", tempFile);
	}

	try {
		// Step 3: Build the conversion command
		const commandArgs = buildMakeDNGCommand(metadata, inputForDNG, outputPath);
		log.info("Command:", commandArgs.join(" "));

		// Step 4: Convert to DNG
		await convertBitmapToDNG(inputForDNG, outputPath, commandArgs);

		// Step 5: Apply stretch via DefaultScale
		const stretchFactor = ratioX / ratioY;
		await stretchDNG(outputPath, stretchFactor, 1);

		// Step 6: Copy original metadata (preserving DNG-specific tags)
		//await copyMetadataToDNG(filePath, outputPath, ["DefaultScale"]);

		log.info("Bitmap processed:", outputPath);
		return outputPath;
	} finally {
		// Clean up temp file
		if (tempFile) {
			try {
				await fs.unlink(tempFile);
				log.info("Cleaned up temp file");
			} catch (e) {
				log.warn(`Failed to clean up temp file ${tempFile}: ${e.message}`);
			}
		}
	}
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Main desqueeze function - routes to appropriate processor
 * @param {string} filePath - Input file path
 * @param {number} ratioX - Horizontal stretch ratio
 * @param {number} ratioY - Vertical stretch ratio
 * @returns {Promise<string>} Output file path
 */
async function desqueeze(filePath, ratioX, ratioY) {
	const ext = path.extname(filePath).toLowerCase();

	if (RAW_FORMATS.has(ext)) {
		return await processRAW(filePath, ext, ratioX, ratioY);
	}

	if (BITMAP_FORMATS.has(ext)) {
		return await processBitmap(filePath, ext, ratioX, ratioY);
	}

	throw new Error(`File format ${ext} is not supported`);
}

export { desqueeze, processRAW, processBitmap };
