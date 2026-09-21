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
import { isPlaceholderNeutral, neutralFromWbTags, formatNeutral } from "../analyzers/white-balance.js";

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
		await this.repairAsShotNeutral(inputPath, outputPath);
		log.info(`DNG file created: ${outputPath}`);
		return outputPath;
	}

	/**
	 * Restore the camera's white balance when DNGLab did not carry it over.
	 *
	 * DNGLab writes AsShotNeutral as "1 1 1" when its decoder has no
	 * white-balance reader for a camera (the Sony ILCE-7CM2, for one). A raw
	 * editor takes that literally — "the neutral the camera saw was equal
	 * R = G = B" — and opens the DNG at a temperature and tint nothing like
	 * the original's: 2350K / −150 against the ARW's 5350K / +13. Dialling
	 * the original's numbers back in then goes magenta, because the baseline
	 * they are relative to is wrong. The camera's multipliers are still in
	 * the source's maker notes, which exiftool reads, so the neutral is
	 * rebuilt from them. Only a placeholder is replaced; a neutral DNGLab did
	 * read is left alone.
	 *
	 * @param {string} sourcePath - The raw file the DNG was converted from
	 * @param {string} dngPath
	 * @returns {Promise<boolean>} Whether the tag was rewritten
	 */
	async repairAsShotNeutral(sourcePath, dngPath) {
		const dng = await this._exiftool.read(dngPath);
		if (!isPlaceholderNeutral(dng.AsShotNeutral)) return false;

		const source = await this._exiftool.read(sourcePath);
		const neutral = neutralFromWbTags(source);
		if (!neutral) {
			log.warn(
				`AsShotNeutral is a placeholder and ${sourcePath} carries no readable white balance; leaving it.`
			);
			return false;
		}

		const value = formatNeutral(neutral);
		log.info(`Restoring AsShotNeutral from the camera's white balance: ${value}`);
		await this._exiftool.write(dngPath, { AsShotNeutral: value }, ["-overwrite_original"]);
		return true;
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
