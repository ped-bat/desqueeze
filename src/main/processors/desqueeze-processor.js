/**
 * DesqueezeProcessor - Main orchestrator that routes files to the appropriate processor
 *
 * This is the single entry point for the desqueeze pipeline.
 * It determines the file type and delegates to RawProcessor or BitmapProcessor.
 */

import path from "path";
import PQueueModule from "p-queue";
const PQueue = PQueueModule.default || PQueueModule;
import log from "../logger.js";
import { AppConfig } from "../config.js";
import { validateFilePath, validateRatios } from "../utils/validation.js";
import { RawProcessor } from "./raw-processor.js";
import { BitmapProcessor } from "./bitmap-processor.js";
import { DngOperations } from "./dng-operations.js";
import { RawConverterService } from "../services/raw-converter.js";

/**
 * @typedef {Object} OutputOptions
 * @property {string}  format  - Output format key (e.g. "dng", "jpg", "png", "tiff", "webp")
 * @property {string}  ext     - Output file extension (e.g. ".dng", ".jpg")
 * @property {object}  options - Format-specific options (quality, compression, etc.)
 */

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

		// Cancellation: aborting rejects every queued-but-not-started job.
		// Jobs already running finish normally (their child processes are
		// not killed mid-write, so no partial output is left behind).
		this._abort = new AbortController();
	}

	/**
	 * Cancel all queued (not yet started) jobs. In-flight jobs finish.
	 * A fresh AbortController is armed for the next batch.
	 */
	cancel() {
		this._abort.abort();
		this._abort = new AbortController();
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
	 * @returns {OutputOptions}
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
	 * @param {{ onStart?: (filePath: string) => void }} [hooks] - Lifecycle callbacks
	 * @returns {Promise<string>} Output file path
	 * @throws {Error} If file format is unsupported, validation fails, or the job is cancelled
	 */
	async process(filePath, ratioX, ratioY, outputRaw, hooks = {}) {
		validateFilePath(filePath);
		validateRatios(ratioX, ratioY);

		return this._queue.add(
			async () => {
				hooks.onStart?.(filePath);

				const ext = path.extname(filePath).toLowerCase();
				const outputOpts = this._buildOutputOpts(outputRaw);

				if (AppConfig.RAW_FORMATS.has(ext)) {
					return this._rawProcessor.process(filePath, ext, ratioX, ratioY, outputOpts);
				}

				if (AppConfig.BITMAP_FORMATS.has(ext)) {
					return this._bitmapProcessor.process(filePath, ext, ratioX, ratioY, outputOpts);
				}

				throw new Error(`File format "${ext}" is not supported.`);
			},
			{ signal: this._abort.signal }
		);
	}
}

export { DesqueezeProcessor };
