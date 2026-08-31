/**
 * SharpService - Centralized Sharp image operations
 *
 * Wraps the sharp library to provide:
 * - Metadata extraction
 * - Alpha channel flattening
 * - Format export (JPEG, PNG, TIFF, WebP)
 *
 * Avoids creating multiple Sharp instances for the same file.
 */

import os from "os";
import sharp from "sharp";
import log from "../logger.js";
import { AppConfig } from "../config.js";

// Batch processing touches each large file once, so libvips' operation
// cache only holds memory hostage — disable it. Split the CPU threads
// across the app's concurrent jobs instead of letting every pipeline
// spawn a full thread pool (queue slots × cores oversubscribes badly).
sharp.cache(false);
sharp.concurrency(
	Math.max(1, Math.ceil(os.cpus().length / AppConfig.MAX_CONCURRENCY))
);

class SharpService {
	/**
	 * Read image metadata.
	 * @param {string} filePath - Path to the image file
	 * @returns {Promise<import("sharp").Metadata>}
	 */
	async getMetadata(filePath) {
		return sharp(filePath).metadata();
	}

	/**
	 * Flatten alpha channel to a solid background color.
	 * @param {string} inputPath - Path to the input image
	 * @param {string} outputPath - Path for the flattened output
	 * @param {{r: number, g: number, b: number}} [background={r:255,g:255,b:255}] - Background color
	 * @returns {Promise<string>} Output path
	 */
	async flattenAlpha(inputPath, outputPath, background = { r: 255, g: 255, b: 255 }) {
		log.info(`Flattening alpha channel: ${inputPath}`);
		await sharp(inputPath)
			.flatten({ background })
			.toFile(outputPath);
		log.info(`Alpha-flattened file created: ${outputPath}`);
		return outputPath;
	}

	// ====================================================================
	// Pixel Stretch (desqueeze) + Format Export
	// ====================================================================

	/**
	 * Read an image, optionally stretch it horizontally, and export to the
	 * specified format. This is the main entry point used by processors for
	 * non-DNG output.
	 *
	 * Because non-DNG formats have no concept of DefaultScale, the stretch
	 * must be baked into the pixels — this is inherently a lossy resampling
	 * step, even when the output codec is "lossless" (PNG, lossless WebP, etc.).
	 *
	 * @param {string} inputPath     - Source image path
	 * @param {string} outputPath    - Destination path
	 * @param {string} format        - One of: "jpg", "png", "tiff", "webp"
	 * @param {object} [opts={}]     - Format-specific options
	 * @param {number} [stretchFactor=1] - Horizontal stretch multiplier
	 * @returns {Promise<string>} outputPath
	 * @throws {Error} If format is unsupported
	 */
	async exportToFormat(inputPath, outputPath, format, opts = {}, stretchFactor = 1) {
		// DNG/TIFF files often contain non-standard tags (e.g. OriginalRawFileData)
		// that libvips warns about. Without failOn:"none" those warnings are fatal.
		// sequentialRead streams rows instead of loading the full image into memory
		// — significant speed-up for large TIFFs from dcraw_emu.
		const sharpOpts = { failOn: "none", sequentialRead: true };

		// autoOrient() applies the EXIF Orientation tag before any resize, so
		// the stretch always lands on the *displayed* horizontal axis — without
		// it, images stored rotated 90° (orientation 5-8) would be stretched
		// vertically. keepMetadata() carries EXIF/ICC/XMP through to the output;
		// dropping the ICC profile visibly shifts colors for AdobeRGB/P3 files.
		let pipeline = sharp(inputPath, sharpOpts).autoOrient().keepMetadata();

		// Apply horizontal pixel stretch if needed, sized against the
		// orientation-corrected (displayed) dimensions.
		if (stretchFactor && stretchFactor !== 1) {
			const meta = await sharp(inputPath, sharpOpts).metadata();
			const rotated = (meta.orientation || 1) >= 5;
			const dispWidth = meta.autoOrient?.width ?? (rotated ? meta.height : meta.width);
			const dispHeight = meta.autoOrient?.height ?? (rotated ? meta.width : meta.height);
			const newWidth = Math.round(dispWidth * stretchFactor);
			log.info(`Stretching ${dispWidth}→${newWidth}px (×${stretchFactor})`);
			pipeline = pipeline.resize({ width: newWidth, height: dispHeight, fit: "fill" });
		}

		// Encode to target format
		switch (format) {
			case "jpg":
				pipeline = pipeline.jpeg({ quality: opts.quality ?? 95 });
				break;
			case "png":
				// adaptiveFiltering:false uses fixed None filter — much faster for
				// continuous-tone photo data with negligible size increase.
				pipeline = pipeline.png({
					compressionLevel: opts.compressionLevel ?? 2,
					adaptiveFiltering: false,
				});
				break;
			case "tiff":
				// Horizontal predictor dramatically improves compression ratio and
				// speed for continuous-tone 16-bit data with LZW/Deflate.
				pipeline = pipeline.tiff({
					compression: opts.compression ?? "lzw",
					predictor: opts.compression === "none" ? "none" : "horizontal",
				});
				break;
			case "webp":
				// effort controls encoder speed vs compression. Default (4) is extremely
				// slow on large images. 2 is ~4× faster with negligible quality loss.
				pipeline = pipeline.webp({
					quality: opts.quality ?? 90,
					lossless: opts.lossless ?? false,
					effort: 2,
					preset: "photo",
				});
				break;
			default:
				throw new Error(`Unsupported export format: "${format}"`);
		}

		log.info(`Exporting ${format.toUpperCase()}: ${outputPath}`);
		await pipeline.toFile(outputPath);
		return outputPath;
	}
}

export { SharpService };
