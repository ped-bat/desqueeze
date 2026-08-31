/**
 * RawConverterService - Converts RAW files to TIFF using LibRaw's dcraw_emu
 *
 * This service bridges the gap between RAW sensor data and Sharp-readable
 * bitmap formats. Sharp/libvips cannot demosaic Bayer RAW data, so we use
 * dcraw_emu to render a full-resolution TIFF that Sharp can then
 * stretch and encode to the final output format.
 *
 * Pipeline: RAW → dcraw_emu → TIFF (temp) → Sharp
 *
 * Key dcraw_emu flags:
 *   -T     Output TIFF instead of PPM
 *   -w     Use camera white balance
 *   -o 1   Output colorspace: sRGB
 *   -q 2   PPG interpolation (fast, high quality)
 *   -6     16-bit output (only when target format supports it)
 *   -Z <suffix>  Output to specific file (suffix replaces extension)
 */

import path from "path";
import fs from "fs/promises";
import log from "../logger.js";
import { BinaryResolver } from "./binary-resolver.js";
import { CommandRunner } from "./command-runner.js";
import { getTempFilePath, safeUnlink } from "../utils/file-utils.js";

/** Only TIFF truly benefits from 16-bit; PNG photos are virtually always 8-bit */
const HIGH_BIT_DEPTH_FORMATS = new Set(["tiff"]);

class RawConverterService {
	/**
	 * @param {Object} [deps]
	 * @param {BinaryResolver} [deps.binaryResolver]
	 * @param {CommandRunner} [deps.commandRunner]
	 */
	constructor(deps = {}) {
		this._resolver = deps.binaryResolver || null;
		this._runner = deps.commandRunner || new CommandRunner();
	}

	/**
	 * Set the binary resolver (needed when wired after construction).
	 * @param {BinaryResolver} resolver
	 */
	setBinaryResolver(resolver) {
		this._resolver = resolver;
	}

	/**
	 * Convert a RAW file to a TIFF using dcraw_emu.
	 *
	 * The output TIFF is written to the OS temp directory and the caller
	 * is responsible for cleaning it up when done.
	 *
	 * Bit depth is chosen automatically based on the target format:
	 *   - TIFF     → 16-bit (preserves dynamic range)
	 *   - JPG/PNG/WebP → 8-bit (targets are 8-bit anyway, halves processing time)
	 *
	 * @param {string} inputPath - Absolute path to the RAW file
	 * @param {string} [targetFormat="jpg"] - Target output format (affects bit depth)
	 * @returns {Promise<string>} Path to the rendered TIFF file
	 * @throws {Error} If dcraw_emu is not available or conversion fails
	 */
	async convertToTiff(inputPath, targetFormat = "jpg") {
		if (!this._resolver) {
			throw new Error(
				"BinaryResolver not set. Call setBinaryResolver() first."
			);
		}

		const dcrawPath = await this._resolver.verifyDcrawEmuBinary();
		const tempTiff = getTempFilePath(".tiff");
		const sixteenBit = HIGH_BIT_DEPTH_FORMATS.has(targetFormat);

		const args = [
			"-T",       // TIFF output
			"-w",       // Camera white balance
			"-W",       // Don't auto-brighten (skips extra image scan)
			"-o", "1",  // sRGB output colorspace
			"-q", "2",  // PPG interpolation (fast, high quality)
		];

		if (sixteenBit) {
			args.push("-6");  // 16-bit output for formats that benefit from it
		}

		args.push("-Z", tempTiff, inputPath);

		log.info(
			`Rendering RAW → ${sixteenBit ? "16" : "8"}-bit TIFF via dcraw_emu: ` +
			`${path.basename(inputPath)}`
		);

		try {
			await this._runner.exec(dcrawPath, args);

			// dcraw_emu can exit 0 while writing nothing (or a truncated file)
			// for unsupported/corrupt raws — verify before handing to Sharp.
			const stat = await fs.stat(tempTiff).catch(() => null);
			if (!stat || stat.size === 0) {
				throw new Error("dcraw_emu produced no output (unsupported or corrupt RAW?)");
			}

			log.info(`TIFF rendered: ${tempTiff}`);
			return tempTiff;
		} catch (error) {
			// Don't leak a partial TIFF in the temp dir on failure
			await safeUnlink(tempTiff);
			log.error(`dcraw_emu conversion failed: ${error.message}`);
			throw new Error(
				`Failed to convert RAW to TIFF: ${error.message}`
			);
		}
	}
}

export { RawConverterService };
