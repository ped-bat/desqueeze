const path = require("path");
const fs = require("fs").promises;
const { RAW_FORMATS, BITMAP_FORMATS, ratioX, ratioY } = require("../config");
const { convertToDNG, setDefaultScale } = require("../converters/raw");
const { stretchBitmap } = require("../converters/bitmap");

// Process RAW files: Convert to DNG + set DefaultScale metadata
async function processRAW(filePath, ext) {
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
async function processBitmap(filePath, ext) {
	const outputDir = path.dirname(filePath);
	const baseName = path.basename(filePath, ext);
	const outputPath = path.join(outputDir, `${baseName}-desqueezed.tiff`);

	console.log("Stretching bitmap...");
	await stretchBitmap(filePath, outputPath, ratioX);

	console.log("Bitmap processed:", outputPath);
	return outputPath;
}

// Main desqueeze function - routes to appropriate processor
async function desqueeze(filePath) {
	const ext = path.extname(filePath).toLowerCase();

	if (RAW_FORMATS.has(ext)) {
		return await processRAW(filePath, ext);
	} else if (BITMAP_FORMATS.has(ext)) {
		return await processBitmap(filePath, ext);
	} else {
		throw new Error(`File format ${ext} is not supported`);
	}
}

module.exports = {
	desqueeze,
	processRAW,
	processBitmap,
};
