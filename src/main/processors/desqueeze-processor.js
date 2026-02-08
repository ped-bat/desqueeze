/**
 * DesqueezeProcessor - Main orchestrator that routes files to the appropriate processor
 *
 * This is the single entry point for the desqueeze pipeline.
 * It determines the file type and delegates to RawProcessor or BitmapProcessor.
 */

import path from "path";
import PQueue from "p-queue";
import log from "../logger.js";
import { AppConfig } from "../config.js";
import { validateFilePath, validateRatios } from "../utils/validation.js";
import { RawProcessor } from "./raw-processor.js";
import { BitmapProcessor } from "./bitmap-processor.js";
import { DngOperations } from "./dng-operations.js";
import { RawConverterService } from "../services/raw-converter.js";

class DesqueezeProcessor {
	/**
	 * @param {Object} [deps] - Injectable dependencies
	 * @param {DngOperations} [deps.dngOps]
	 * @param {RawConverterService} [deps.rawConverter]
	 * @param {RawProcessor} [deps.rawProcessor]
	 * @param {BitmapProcessor} [deps.bitmapProcessor]
	 */
	constructor(deps = {}) {
		const dngOps = deps.dngOps || new DngOperations();
		const rawConverter = deps.rawConverter || new RawConverterService();
		this._rawProcessor = deps.rawProcessor || new RawProcessor({ dngOps, rawConverter });
		this._bitmapProcessor = deps.bitmapProcessor || new BitmapProcessor({ dngOps });
		this._dngOps = dngOps;
		this._rawConverter = rawConverter;

		// Centralized concurrency queue
		this._queue = new PQueue({ concurrency: AppConfig.MAX_CONCURRENCY });
	}

	/**
	 * Set the binary resolver (call this once after Electron app is ready).
	 * @param {import("../services/binary-resolver.js").BinaryResolver} resolver
	 */
	setBinaryResolver(resolver) {
		this._dngOps.setBinaryResolver(resolver);
		this._rawConverter.setBinaryResolver(resolver);
	}

	/**
	 * Build a normalised OutputOptions object from the renderer payload.
	 *
	 * @param {{ format?: string, options?: object }} [raw] - Raw payload from IPC
	 * @returns {import("./base-processor.js").OutputOptions}
	 */
	_buildOutputOpts(raw = {}) {
		const formatKey = raw.format || AppConfig.DEFAULT_OUTPUT_FORMAT;
		const formatDef = AppConfig.OUTPUT_FORMATS[formatKey];

		if (!formatDef) {
			throw new Error(`Unknown output format: "${formatKey}"`);
		}

		return {
			format: formatKey,
			ext: formatDef.ext,
			options: { ...formatDef.options, ...raw.options },
		};
	}

	/**
	 * Process a file through the desqueeze pipeline (queued).
	 *
	 * @param {string} filePath - Input file path
	 * @param {number} ratioX - Horizontal stretch ratio
	 * @param {number} ratioY - Vertical stretch ratio
	 * @param {{ format?: string, options?: object }} [outputRaw] - Output format payload from renderer
	 * @returns {Promise<string>} Output file path
	 * @throws {Error} If file format is unsupported or validation fails
	 */
	async process(filePath, ratioX, ratioY, outputRaw) {
		validateFilePath(filePath);
		validateRatios(ratioX, ratioY);

		return this._queue.add(async () => {
			const ext = path.extname(filePath).toLowerCase();
			const outputOpts = this._buildOutputOpts(outputRaw);

			if (AppConfig.RAW_FORMATS.has(ext)) {
				return this._rawProcessor.process(filePath, ext, ratioX, ratioY, outputOpts);
			}

			if (AppConfig.BITMAP_FORMATS.has(ext)) {
				return this._bitmapProcessor.process(filePath, ext, ratioX, ratioY, outputOpts);
			}

			throw new Error(`File format "${ext}" is not supported.`);
		});
	}
}

export { DesqueezeProcessor };
