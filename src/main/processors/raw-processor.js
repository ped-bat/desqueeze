/**
 * RawProcessor - Processes RAW files through the desqueeze pipeline
 *
 * Pipeline (DNG output):   RAW → DNG → Write DefaultScale tag (metadata-only, lossless)
 * Pipeline (other output): RAW → dcraw_emu → TIFF (temp, 8 or 16-bit) → Sharp pixel-stretch + export → Cleanup
 */

import fs from "fs/promises";
import log from "../logger.js";
import { SharpService } from "../services/sharp-service.js";
import { RawConverterService } from "../services/raw-converter.js";
import { getOutputPath, safeUnlink } from "../utils/file-utils.js";

class RawProcessor {
	/**
	 * @param {Object} deps
	 * @param {import("./dng-operations.js").DngOperations} deps.dngOps
	 * @param {SharpService} [deps.sharpService]
	 * @param {RawConverterService} [deps.rawConverter]
	 */
	constructor(deps) {
		this._dngOps = deps.dngOps;
		this._sharp = deps.sharpService || new SharpService();
		this._rawConverter = deps.rawConverter || new RawConverterService();
	}

	/**
	 * Process a RAW file: convert to DNG, apply desqueeze tag,
	 * and optionally export to a non-DNG format.
	 *
	 * @param {string} filePath - Input RAW file path
	 * @param {string} ext - File extension (lowercase, with dot)
	 * @param {number} ratioX - Horizontal stretch ratio
	 * @param {number} ratioY - Vertical stretch ratio
	 * @param {import("./desqueeze-processor.js").OutputOptions} outputOpts
	 * @returns {Promise<string>} Output file path
	 */
	async process(filePath, ext, ratioX, ratioY, outputOpts) {
		if (outputOpts.format === "dng") {
			return this._processDng(filePath, ext, ratioX, ratioY);
		}

		return this._processExport(filePath, ext, ratioX, ratioY, outputOpts);
	}

	/** DNG output — metadata-only desqueeze, no pixel resampling */
	async _processDng(filePath, ext, ratioX, ratioY) {
		const outputPath = await getOutputPath(filePath, ext, ".dng");

		if (ext !== ".dng") {
			log.info("Converting RAW to DNG...");
			await this._dngOps.convertRAWToDNG(filePath, outputPath);
		} else {
			log.info("Input is already DNG, copying...");
			await fs.copyFile(filePath, outputPath);
		}

		await this._dngOps.writeDesqueezeTag(outputPath, ratioX, ratioY);

		log.info(`RAW processed (DNG): ${outputPath}`);
		return outputPath;
	}

	/**
	 * Non-DNG output — RAW → dcraw_emu → TIFF (temp) → Sharp stretch → export.
	 *
	 * Sharp/libvips cannot demosaic RAW Bayer data, so we use LibRaw's
	 * dcraw_emu to render a full-resolution 16-bit TIFF first, then
	 * Sharp handles the pixel stretch and format encoding.
	 */
	async _processExport(filePath, ext, ratioX, ratioY, outputOpts) {
		const outputPath = await getOutputPath(filePath, ext, outputOpts.ext);
		const stretchFactor = ratioX / ratioY;

		// Step 1: Render RAW → TIFF via dcraw_emu
		// Bit depth is chosen automatically: 16-bit for tiff, 8-bit for jpg/png/webp
		const tempTiff = await this._rawConverter.convertToTiff(filePath, outputOpts.format);

		try {
			// Step 2: Stretch pixels + encode to target format
			await this._sharp.exportToFormat(
				tempTiff, outputPath, outputOpts.format, outputOpts.options, stretchFactor
			);

			log.info(`RAW processed (${outputOpts.format.toUpperCase()}): ${outputPath}`);
			return outputPath;
		} finally {
			// Step 3: Always clean up the temp TIFF
			await safeUnlink(tempTiff);
		}
	}
}

export { RawProcessor };
