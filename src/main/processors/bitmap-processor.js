/**
 * BitmapProcessor - Processes bitmap files through the desqueeze pipeline
 *
 * Pipeline (DNG):   Analyze → Flatten alpha (if RGBA) → Desqueezed preview (Sharp) → makedng → Metadata copy + DefaultScale → Cleanup
 * Pipeline (other): Sharp pixel-stretch + export (Sharp handles alpha)
 */

import log from "../logger.js";
import { ImageAnalyzer } from "../analyzers/image-analyzer.js";
import { DngCommandBuilder } from "../builders/dng-command-builder.js";
import { SharpService } from "../services/sharp-service.js";
import { getOutputPath, getTempFilePath, safeUnlink } from "../utils/file-utils.js";

/** DNG-specific tags that must be preserved when copying metadata */
const DNG_PRESERVE_TAGS = [
	"DefaultScale",
	"ColorMatrix1",
	"ColorMatrix2",
	"CalibrationIlluminant1",
	"CalibrationIlluminant2",
	"ColorimetricReference",
	"DNGVersion",
	"DNGBackwardVersion",
	"AsShotNeutral",
	"ActiveArea",
	"BlackLevel",
	"WhiteLevel",
	"ForwardMatrix1",
	"ForwardMatrix2",
];

class BitmapProcessor {
	/**
	 * @param {Object} deps
	 * @param {import("./dng-operations.js").DngOperations} deps.dngOps
	 * @param {SharpService} [deps.sharpService]
	 * @param {DngCommandBuilder} [deps.commandBuilder]
	 */
	constructor(deps) {
		this._dngOps = deps.dngOps;
		this._sharp = deps.sharpService || new SharpService();
		this._commandBuilder = deps.commandBuilder || new DngCommandBuilder();
	}

	/**
	 * Process a bitmap file through the desqueeze pipeline.
	 *
	 * @param {string} filePath - Input bitmap file path
	 * @param {string} ext - File extension (lowercase, with dot)
	 * @param {number} ratioX - Horizontal stretch ratio
	 * @param {number} ratioY - Vertical stretch ratio
	 * @param {import("./desqueeze-processor.js").OutputOptions} outputOpts
	 * @returns {Promise<string>} Output file path
	 */
	async process(filePath, ext, ratioX, ratioY, outputOpts) {
		if (outputOpts.format === "dng") {
			// Only the DNG path needs the full analysis (color matrices,
			// ICC profile, alpha detection for makedng). Running it for
			// plain exports would cost a needless exiftool round-trip per file.
			log.info("Analyzing bitmap...");
			const analyzer = new ImageAnalyzer(filePath);
			const metadata = await analyzer.analyze();
			analyzer.printSummary();
			return this._produceDng(filePath, ext, ratioX, ratioY, metadata);
		}
		return this._produceExport(filePath, ext, ratioX / ratioY, outputOpts);
	}

	// ========================================================================
	// Internal pipeline variants
	// ========================================================================

	/**
	 * DNG output — metadata-only desqueeze via DefaultScale.
	 * dnglab makedng doesn't support RGBA, so alpha is flattened to a
	 * temporary RGB file first when needed.
	 */
	async _produceDng(filePath, ext, ratioX, ratioY, metadata) {
		const outputPath = await getOutputPath(filePath, ext, ".dng");

		let inputForDNG = filePath;
		let alphaTemp = null;
		let previewTemp = null;

		if (metadata.hasAlpha) {
			log.info("Image has alpha channel — converting to RGB for DNG conversion...");
			alphaTemp = getTempFilePath(".png");
			await this._sharp.flattenAlpha(filePath, alphaTemp);
			inputForDNG = alphaTemp;
		}

		try {
			// Desqueezed preview + thumbnail for file browsers, which show
			// those instead of applying DefaultScale to the raw data.
			previewTemp = await this._renderPreview(inputForDNG, ratioX / ratioY);
			const commandArgs = this._commandBuilder.build(metadata, inputForDNG, outputPath, {
				previewPath: previewTemp,
			});
			log.info(`Command: ${commandArgs.join(" ")}`);

			await this._dngOps.convertBitmapToDNG(outputPath, commandArgs);
			// Metadata copy + DefaultScale in one exiftool pass (one DNG rewrite)
			await this._dngOps.finalizeDNG(filePath, outputPath, ratioX, ratioY, DNG_PRESERVE_TAGS);

			log.info(`Bitmap processed (DNG): ${outputPath}`);
			return outputPath;
		} catch (error) {
			// Don't leave a partial/untagged DNG behind
			await safeUnlink(outputPath);
			throw error;
		} finally {
			if (alphaTemp) await safeUnlink(alphaTemp);
			if (previewTemp) await safeUnlink(previewTemp);
		}
	}

	/**
	 * Render the desqueezed preview makedng embeds. Best effort: without it
	 * makedng falls back to a squeezed preview of the source, and the DNG
	 * is otherwise unaffected.
	 *
	 * @param {string} inputPath - Bitmap fed to makedng (alpha already flattened)
	 * @param {number} stretchFactor
	 * @returns {Promise<string|null>} Path to the preview JPEG, or null on failure
	 */
	async _renderPreview(inputPath, stretchFactor) {
		const previewPath = getTempFilePath(".jpg");
		try {
			// makedng re-encodes and caps the preview itself, so 2048px is plenty
			await this._sharp.renderPreview(inputPath, previewPath, stretchFactor, { maxWidth: 2048 });
			return previewPath;
		} catch (err) {
			log.warn(`Could not render desqueezed preview: ${err.message}`);
			await safeUnlink(previewPath);
			return null;
		}
	}

	/**
	 * Non-DNG output — no DNG intermediate needed.
	 * Sharp reads the bitmap directly (alpha included), stretches pixels,
	 * and encodes to the target format.
	 */
	async _produceExport(filePath, ext, stretchFactor, outputOpts) {
		const outputPath = await getOutputPath(filePath, ext, outputOpts.ext);

		try {
			await this._sharp.exportToFormat(
				filePath, outputPath, outputOpts.format, outputOpts.options, stretchFactor
			);
		} catch (error) {
			// Don't leave a partial export behind
			await safeUnlink(outputPath);
			throw error;
		}

		log.info(`Bitmap processed (${outputOpts.format.toUpperCase()}): ${outputPath}`);
		return outputPath;
	}
}

export { BitmapProcessor };
