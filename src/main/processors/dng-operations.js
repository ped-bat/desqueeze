/**
 * DngOperations - Reusable DNG file operations
 *
 * Encapsulates all interactions with DNGLab and ExifTool for DNG files:
 * - RAW → DNG conversion
 * - Bitmap → DNG conversion (makedng)
 * - Writing DefaultScale metadata (desqueeze tag)
 * - Copying metadata between files
 *
 * Depends on BinaryResolver, CommandRunner, and ExifToolService.
 */

import fs from "fs/promises";
import log from "../logger.js";
import { BinaryResolver } from "../services/binary-resolver.js";
import { CommandRunner } from "../services/command-runner.js";
import { ExifToolService } from "../services/exiftool-service.js";
import {
	isPlaceholderNeutral,
	gainsFromWbTags,
	neutralFromGains,
	formatTriplet,
} from "../analyzers/white-balance.js";

/** DNG PhotometricInterpretation values of a raw image IFD */
const CFA = 32803;
const LINEAR_RAW = 34892;

class DngOperations {
	/**
	 * @param {Object} [deps] - Injectable dependencies
	 * @param {BinaryResolver} [deps.binaryResolver]
	 * @param {CommandRunner} [deps.commandRunner]
	 * @param {ExifToolService} [deps.exifToolService]
	 */
	constructor(deps = {}) {
		this._resolver = deps.binaryResolver || null;
		this._runner = deps.commandRunner || new CommandRunner();
		this._exiftool = deps.exifToolService || ExifToolService.getInstance();
	}

	/**
	 * Set the binary resolver (needed for Electron context).
	 * @param {BinaryResolver} resolver
	 */
	setBinaryResolver(resolver) {
		this._resolver = resolver;
	}

	/**
	 * Run a DNGLab command.
	 * @param {string[]} args - Command arguments
	 * @returns {Promise<{stdout: string, stderr: string}>}
	 */
	async runDNGLabCommand(args) {
		if (!this._resolver) {
			throw new Error("BinaryResolver not set. Call setBinaryResolver() or pass it in the constructor.");
		}
		const dnglabPath = await this._resolver.verifyDNGLabBinary();
		return this._runner.exec(dnglabPath, args);
	}

	/**
	 * Convert a RAW file to DNG using DNGLab.
	 * @param {string} inputPath - Path to input RAW file
	 * @param {string} outputPath - Path for output DNG file
	 * @returns {Promise<string>} Path to created DNG file
	 */
	async convertRAWToDNG(inputPath, outputPath) {
		const args = [
			"convert",
			"--dng-preview", "true",
			// Don't duplicate the original raw file inside the DNG (~doubles size)
			"--embed-raw", "false",
			"--override",
			inputPath,
			outputPath,
		];

		await this.runDNGLabCommand(args);
		await this._verifyOutput(outputPath);
		await this.repairWhiteBalance(inputPath, outputPath);
		log.info(`DNG file created: ${outputPath}`);
		return outputPath;
	}

	/**
	 * Give the DNG the camera's white balance when DNGLab did not carry it.
	 *
	 * DNGLab writes AsShotNeutral as "1 1 1" when its decoder has no
	 * white-balance coefficients for a file. A raw editor then back-computes
	 * an illuminant from an identity neutral, so its As-Shot temperature and
	 * tint land nowhere near the original's (2350K / −150 against the ARW's
	 * 5350K / +13 on a Sony ILCE-7CM2) even when the picture looks about
	 * right, and colours drift because the wrong matrix is chosen.
	 *
	 * Which tag to write depends on what the stored data is:
	 *
	 *  - Sony's lossless "M"/"S" sizes are stored demosaiced and already
	 *    white-balanced, and arrive here as 3-sample LinearRaw. There "1 1 1"
	 *    is true, and the gains the camera applied belong in AnalogBalance,
	 *    which the editor folds into its colour transform. Writing the
	 *    camera-space neutral instead applies the gains a second time and
	 *    the image goes magenta — measured, not guessed.
	 *
	 *  - Bayer (CFA) data is in camera space, so "1 1 1" is a placeholder and
	 *    AsShotNeutral gets the camera-space neutral.
	 *
	 * Both come from the multipliers still in the source's maker notes. Only
	 * a placeholder is acted on; a neutral DNGLab did read is left alone, and
	 * linear data from a make whose pipeline has not been checked is left
	 * alone too rather than guessed at.
	 *
	 * @param {string} sourcePath - The raw file the DNG was converted from
	 * @param {string} dngPath
	 * @returns {Promise<"kept"|"analog-balance"|"neutral">} What was written
	 */
	async repairWhiteBalance(sourcePath, dngPath) {
		// -a -G1: every IFD's copy of the tag, keyed by group, so the raw
		// image's photometric type is found wherever dnglab put the raw IFD.
		const dng = await this._exiftool.read(dngPath, [
			"-G1", "-a", "-n",
			"-PhotometricInterpretation", "-AsShotNeutral", "-AnalogBalance", "-Make",
		]);
		const tag = (name) => dng[`IFD0:${name}`] ?? dng[name];
		if (!isPlaceholderNeutral(tag("AsShotNeutral"))) return "kept";

		const photometric = Object.entries(dng)
			.filter(([k]) => k.endsWith("PhotometricInterpretation"))
			.map(([, v]) => Number(v))
			.find((v) => v === CFA || v === LINEAR_RAW);

		const source = await this._exiftool.read(sourcePath);
		const gains = gainsFromWbTags(source);
		if (!gains) {
			log.warn(`No white balance to restore: ${sourcePath} carries no readable WB tags; leaving AsShotNeutral as is.`);
			return "kept";
		}

		if (photometric === LINEAR_RAW) {
			const make = String(tag("Make") ?? source.Make ?? "");
			if (!/sony/i.test(make)) {
				log.warn(`Linear raw data from ${make || "an unknown make"} with no white balance; not guessing whether it is pre-balanced.`);
				return "kept";
			}
			const value = formatTriplet(gains);
			log.info(`Pre-balanced linear raw: declaring the camera's gains as AnalogBalance ${value}`);
			await this._exiftool.write(dngPath, { AsShotNeutral: "1 1 1", AnalogBalance: value }, ["-overwrite_original"]);
			return "analog-balance";
		}

		const value = formatTriplet(neutralFromGains(gains));
		log.info(`Restoring AsShotNeutral from the camera's white balance: ${value}`);
		await this._exiftool.write(dngPath, { AsShotNeutral: value }, ["-overwrite_original"]);
		return "neutral";
	}

	/**
	 * Convert a bitmap to DNG using DNGLab makedng.
	 * @param {string} outputPath - Path for output DNG file
	 * @param {string[]} commandArgs - Pre-built command args from DngCommandBuilder
	 * @returns {Promise<string>} Path to created DNG file
	 */
	async convertBitmapToDNG(outputPath, commandArgs) {
		await this.runDNGLabCommand(commandArgs);
		await this._verifyOutput(outputPath);
		log.info(`DNG file created: ${outputPath}`);
		return outputPath;
	}

	/**
	 * Write DefaultScale EXIF tag on a DNG file for desqueezing.
	 * This does NOT stretch pixels — it sets metadata that DNG-aware
	 * software uses to render the correct aspect ratio.
	 *
	 * @param {string} dngPath - Path to DNG file
	 * @param {number} ratioX - Horizontal ratio component
	 * @param {number} ratioY - Vertical ratio component
	 */
	async writeDesqueezeTag(dngPath, ratioX, ratioY) {
		log.info(`Setting DefaultScale to ${ratioX} ${ratioY}...`);
		await this._exiftool.write(
			dngPath,
			{ DefaultScale: `${ratioX} ${ratioY}` },
			["-overwrite_original"]
		);
		log.info("DefaultScale applied successfully.");
	}

	/**
	 * Copy metadata from the source file and set DefaultScale in a single
	 * exiftool pass. Each -overwrite_original write rewrites the entire DNG
	 * on disk, so combining the two operations halves the I/O per file.
	 *
	 * @param {string} sourcePath - Original file to copy metadata from
	 * @param {string} dngPath - DNG file to write metadata to
	 * @param {number} ratioX - Horizontal ratio component of DefaultScale
	 * @param {number} ratioY - Vertical ratio component of DefaultScale
	 * @param {string[]} [preserveTags=["DefaultScale"]] - DNG tags to protect from the copy
	 */
	async finalizeDNG(sourcePath, dngPath, ratioX, ratioY, preserveTags = ["DefaultScale"]) {
		log.info(`Copying metadata and setting DefaultScale to ${ratioX} ${ratioY}...`);

		const excludeArgs = preserveTags.map((tag) => `--${tag}`);

		await this._exiftool.write(
			dngPath,
			{ DefaultScale: `${ratioX} ${ratioY}` },
			[
				"-overwrite_original",
				"-TagsFromFile",
				sourcePath,
				"-all:all",
				"-unsafe",
				...excludeArgs,
			]
		);

		log.info("DNG metadata finalized.");
	}

	/**
	 * Verify that an output file was created.
	 * @param {string} outputPath
	 * @throws {Error} If file doesn't exist
	 */
	async _verifyOutput(outputPath) {
		try {
			await fs.access(outputPath);
		} catch {
			throw new Error(
				`DNG file was not created at: ${outputPath}. Check logs for details.`
			);
		}
	}
}

export { DngOperations };
