/**
 * BitmapProcessor - Processes bitmap files through the desqueeze pipeline
 *
 * Pipeline (DNG):   Analyze → Flatten alpha (if RGBA) → makedng → Metadata copy → DefaultScale → Cleanup
 * Pipeline (other): Analyze → Sharp pixel-stretch + export (Sharp handles alpha)
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
		log.info("Analyzing bitmap...");
		const analyzer = new ImageAnalyzer(filePath);
		const metadata = await analyzer.analyze();
		analyzer.printSummary();

		if (outputOpts.format === "dng") {
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

		if (metadata.hasAlpha) {
			log.info("Image has alpha channel — converting to RGB for DNG conversion...");
			alphaTemp = getTempFilePath(".png");
			await this._sharp.flattenAlpha(filePath, alphaTemp);
			inputForDNG = alphaTemp;
		}

		try {
			const commandArgs = this._commandBuilder.build(metadata, inputForDNG, outputPath);
			log.info(`Command: ${commandArgs.join(" ")}`);

			await this._dngOps.convertBitmapToDNG(outputPath, commandArgs);
			await this._dngOps.copyMetadataToDNG(filePath, outputPath, DNG_PRESERVE_TAGS);
			await this._dngOps.writeDesqueezeTag(outputPath, ratioX, ratioY);

			log.info(`Bitmap processed (DNG): ${outputPath}`);
			return outputPath;
		} finally {
			if (alphaTemp) await safeUnlink(alphaTemp);
		}
	}

	/**
	 * Non-DNG output — no DNG intermediate needed.
	 * Sharp reads the bitmap directly (alpha included), stretches pixels,
	 * and encodes to the target format.
	 */
	async _produceExport(filePath, ext, stretchFactor, outputOpts) {
		const outputPath = await getOutputPath(filePath, ext, outputOpts.ext);

		await this._sharp.exportToFormat(
			filePath, outputPath, outputOpts.format, outputOpts.options, stretchFactor
		);

		log.info(`Bitmap processed (${outputOpts.format.toUpperCase()}): ${outputPath}`);
		return outputPath;
	}
}

export { BitmapProcessor };
