/**
 * BitmapProcessor - Processes bitmap files through the desqueeze pipeline
 *
 * Pipeline (DNG):   Analyze → Flatten alpha → makedng → Metadata copy → DefaultScale → Cleanup
 * Pipeline (other): Analyze → Flatten alpha → Sharp pixel-stretch + export → Cleanup
 */

import log from "../logger.js";
import { BaseProcessor } from "./base-processor.js";
import { ImageAnalyzer } from "../analyzers/image-analyzer.js";
import { DngCommandBuilder } from "../builders/dng-command-builder.js";
import { SharpService } from "../services/sharp-service.js";
import { getTempFilePath, safeUnlink } from "../utils/file-utils.js";

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

class BitmapProcessor extends BaseProcessor {
	/**
	 * @param {Object} deps
	 * @param {import("./dng-operations.js").DngOperations} deps.dngOps
	 * @param {SharpService} [deps.sharpService]
	 * @param {DngCommandBuilder} [deps.commandBuilder]
	 */
	constructor(deps) {
		super(deps);
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
	 * @param {import("./base-processor.js").OutputOptions} outputOpts
	 * @returns {Promise<string>} Output file path
	 */
	async process(filePath, ext, ratioX, ratioY, outputOpts) {
		const isDng = outputOpts.format === "dng";

		// Step 1: Analyze image
		log.info("Analyzing bitmap...");
		const analyzer = new ImageAnalyzer(filePath);
		const metadata = await analyzer.analyze();
		analyzer.printSummary();

		// Step 2: Pre-process alpha channel if needed (dnglab doesn't support RGBA)
		let inputForDNG = filePath;
		let alphaTemp = null;

		if (metadata.hasAlpha) {
			log.info("Image has alpha channel — converting to RGB...");
			alphaTemp = getTempFilePath(".png");
			await this._sharp.flattenAlpha(filePath, alphaTemp);
			inputForDNG = alphaTemp;
		}

		const stretchFactor = ratioX / ratioY;

		try {
			if (isDng) {
				return await this._produceDng(filePath, ext, inputForDNG, metadata, stretchFactor);
			}
			return await this._produceExport(filePath, ext, inputForDNG, metadata, stretchFactor, outputOpts);
		} finally {
			if (alphaTemp) await safeUnlink(alphaTemp);
		}
	}

	// ========================================================================
	// Internal pipeline variants
	// ========================================================================

	/** DNG output — same as before */
	async _produceDng(filePath, ext, inputForDNG, metadata, stretchFactor) {
		const outputPath = await this._getOutputPath(filePath, ext, ".dng");

		const commandArgs = this._commandBuilder.build(metadata, inputForDNG, outputPath);
		log.info(`Command: ${commandArgs.join(" ")}`);

		await this._dngOps.convertBitmapToDNG(outputPath, commandArgs);
		await this._dngOps.copyMetadataToDNG(filePath, outputPath, DNG_PRESERVE_TAGS);
		await this._dngOps.writeDesqueezeTag(outputPath, stretchFactor, 1);

		log.info(`Bitmap processed (DNG): ${outputPath}`);
		return outputPath;
	}

	/**
	 * Non-DNG output — no DNG intermediate needed.
	 * Sharp can read bitmaps directly, so we just stretch pixels + encode.
	 * The DNG pipeline (makedng, DefaultScale) is skipped entirely.
	 */
	async _produceExport(filePath, ext, inputForDNG, metadata, stretchFactor, outputOpts) {
		const outputPath = await this._getOutputPath(filePath, ext, outputOpts.ext);

		// inputForDNG is already alpha-flattened if needed — use it as the source
		await this._sharp.exportToFormat(
			inputForDNG, outputPath, outputOpts.format, outputOpts.options, stretchFactor
		);

		log.info(`Bitmap processed (${outputOpts.format.toUpperCase()}): ${outputPath}`);
		return outputPath;
	}
}

export { BitmapProcessor };
