/**
 * RawProcessor - Processes RAW files through the desqueeze pipeline
 *
 * Pipeline (DNG output):   RAW → DNG → Desqueezed preview (Sharp) → DefaultScale + preview swap (metadata-only, lossless)
 * Pipeline (other output): RAW → dcraw_emu → TIFF (temp, 8 or 16-bit) → Sharp pixel-stretch + export → Cleanup
 */

import fs from "fs/promises";
import log from "../logger.js";
import { SharpService } from "../services/sharp-service.js";
import { RawConverterService } from "../services/raw-converter.js";
import { ExifToolService } from "../services/exiftool-service.js";
import { getOutputPath, getTempFilePath, safeUnlink } from "../utils/file-utils.js";

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

	/**
	 * DNG output — metadata-only desqueeze, no resampling of the raw data.
	 * The embedded preview is re-rendered with the stretch applied, since
	 * file browsers and culling tools show that JPEG rather than honouring
	 * DefaultScale.
	 */
	async _processDng(filePath, ext, ratioX, ratioY) {
		const outputPath = await getOutputPath(filePath, ext, ".dng");
		let preview = null;

		try {
			if (ext !== ".dng") {
				log.info("Converting RAW to DNG...");
				await this._dngOps.convertRAWToDNG(filePath, outputPath);
			} else {
				log.info("Input is already DNG, copying...");
				await fs.copyFile(filePath, outputPath);
			}

			// A DNG input may already carry a DefaultScale (and a preview
			// rendered to match it), so only the remaining stretch is applied
			// to the preview while the tag itself is overwritten outright.
			const layout = await this._dngOps.inspectLayout(outputPath);
			const previewStretch = ratioX / ratioY / layout.currentScale;
			preview = await this._renderDesqueezedPreview(outputPath, previewStretch);

			await this._dngOps.writeDesqueezeTag(outputPath, ratioX, ratioY, preview, layout);
		} catch (error) {
			// Don't leave a partial/untagged DNG behind
			await safeUnlink(outputPath);
			throw error;
		} finally {
			if (preview) await safeUnlink(preview.path);
		}

		log.info(`RAW processed (DNG): ${outputPath}`);
		return outputPath;
	}

	/**
	 * Pull the preview dnglab (or the camera) embedded in the DNG and
	 * re-encode it with the stretch baked in. Best effort: the DNG is still
	 * correct without it, so any failure just leaves the squeezed preview.
	 *
	 * @param {string} dngPath
	 * @param {number} stretchFactor
	 * @returns {Promise<import("./dng-operations.js").DngPreview|null>}
	 */
	async _renderDesqueezedPreview(dngPath, stretchFactor) {
		const extracted = getTempFilePath(".jpg");
		const stretched = getTempFilePath(".jpg");

		try {
			const found = await ExifToolService.getInstance().extractPreview(dngPath, extracted);
			if (!found) {
				log.warn("DNG has no embedded preview; file browsers will show it squeezed.");
				return null;
			}
			return await this._sharp.renderPreview(extracted, stretched, stretchFactor);
		} catch (err) {
			log.warn(`Could not render desqueezed preview: ${err.message}`);
			await safeUnlink(stretched);
			return null;
		} finally {
			await safeUnlink(extracted);
		}
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

			// Step 3: Carry the camera metadata over — dcraw_emu's TIFF has none.
			// Orientation is excluded: dcraw_emu already rotates the pixels, so
			// copying the tag would make viewers rotate a second time.
			await this._copyExifFromOriginal(filePath, outputPath);

			log.info(`RAW processed (${outputOpts.format.toUpperCase()}): ${outputPath}`);
			return outputPath;
		} catch (error) {
			// Don't leave a partial export behind
			await safeUnlink(outputPath);
			throw error;
		} finally {
			// Always clean up the temp TIFF
			await safeUnlink(tempTiff);
		}
	}

	/** Copy EXIF from the original RAW onto an export; non-fatal on failure. */
	async _copyExifFromOriginal(sourcePath, outputPath) {
		try {
			await ExifToolService.getInstance().write(outputPath, {}, [
				"-overwrite_original",
				"-TagsFromFile",
				sourcePath,
				"-all:all",
				"--Orientation",
			]);
		} catch (err) {
			log.warn(`Could not copy EXIF metadata to export: ${err.message}`);
		}
	}
}

export { RawProcessor };
