import path from "path";
import fs from "fs/promises";
import { RAW_FORMATS, BITMAP_FORMATS } from "../config.js";
import { convertToDNG, setDefaultScale } from "../converters/raw.js";
import { stretchBitmap } from "../converters/bitmap.js";

// Ensure desqueezed output folder exists and return output path
async function getOutputPath(filePath, ext, outputExt = ext) {
	const dir = path.dirname(filePath);
	const outputDir = path.join(dir, "desqueezed");
	await fs.mkdir(outputDir, { recursive: true });
	const baseName = path.basename(filePath, ext);
	return path.join(outputDir, `${baseName}-desqueezed${outputExt}`);
}

// Process RAW files: Convert to DNG + set DefaultScale metadata
async function processRAW(filePath, ext, ratioX, ratioY) {
	const outputPath = await getOutputPath(filePath, ext, ".dng");

	if (ext !== ".dng") {
		console.log("Converting RAW to DNG...");
		await convertToDNG(filePath, outputPath);
	} else {
		await fs.copyFile(filePath, outputPath);
	}

	await setDefaultScale(outputPath, ratioX, ratioY);
	console.log("RAW processed:", outputPath);
	return outputPath;
}

// Process Bitmap files: Stretch pixels + save as TIFF
async function processBitmap(filePath, ext, ratioX, ratioY) {
	const outputPath = await getOutputPath(filePath, ext, ".tiff");
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
