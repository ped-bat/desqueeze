import path from "path";
import fs from "fs/promises";
import { RAW_FORMATS, BITMAP_FORMATS } from "../config.js";
import { convertToDNG, setDefaultScale } from "../converters/raw.js";
import { stretchBitmap } from "../converters/bitmap.js";

// Process RAW files: Convert to DNG + set DefaultScale metadata
async function processRAW(filePath, ext, ratioX, ratioY) {
	let outputPath;

	// Convert non-DNG RAW files to DNG
	if (ext !== ".dng") {
		console.log("Converting RAW to DNG...");
		outputPath = await convertToDNG(filePath);
	} else {
		// For existing DNG, create a copy with -desqueezed suffix
		const outputDir = path.dirname(filePath);
		const baseName = path.basename(filePath, ext);
		outputPath = path.join(outputDir, `${baseName}-desqueezed.dng`);
		await fs.copyFile(filePath, outputPath);
	}

	// Set DefaultScale metadata for anamorphic correction
	await setDefaultScale(outputPath, ratioX, ratioY);

	console.log("RAW processed:", outputPath);
	return outputPath;
}

// Process Bitmap files: Stretch pixels + save as TIFF
async function processBitmap(filePath, ext, ratioX, ratioY) {
	const outputDir = path.dirname(filePath);
	const baseName = path.basename(filePath, ext);
	const outputPath = path.join(outputDir, `${baseName}-desqueezed.tiff`);

	// Calculate stretch factor from ratios
	const stretchFactor = ratioX / ratioY;

	console.log("Stretching bitmap with factor:", stretchFactor);
	await stretchBitmap(filePath, outputPath, stretchFactor);

	console.log("Bitmap processed:", outputPath);
	return outputPath;
}

// Main desqueeze function - routes to appropriate processor
async function desqueeze(filePath, ratioX, ratioY) {
	const ext = path.extname(filePath).toLowerCase();

	if (RAW_FORMATS.has(ext)) {
		return await processRAW(filePath, ext, ratioX, ratioY);
	} else if (BITMAP_FORMATS.has(ext)) {
		return await processBitmap(filePath, ext, ratioX, ratioY);
	} else {
		throw new Error(`File format ${ext} is not supported`);
	}
}

export { desqueeze, processRAW, processBitmap };
