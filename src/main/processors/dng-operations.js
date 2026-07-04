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
			"--override",
			inputPath,
			outputPath,
		];

		await this.runDNGLabCommand(args);
		await this._verifyOutput(outputPath);
		log.info(`DNG file created: ${outputPath}`);
		return outputPath;
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
	 * Copy metadata from source file to DNG, preserving DNG-specific tags.
	 * @param {string} sourcePath - Original file to copy metadata from
	 * @param {string} dngPath - DNG file to write metadata to
	 * @param {string[]} [preserveTags=["DefaultScale"]] - Tags to preserve
	 */
	async copyMetadataToDNG(sourcePath, dngPath, preserveTags = ["DefaultScale"]) {
		log.info("Copying metadata from original file...");

		const excludeArgs = preserveTags.map((tag) => `--${tag}`);

		await this._exiftool.write(dngPath, {}, [
			"-overwrite_original",
			"-TagsFromFile",
			sourcePath,
			"-all:all",
			"-unsafe",
			...excludeArgs,
		]);

		log.info("Metadata copied successfully.");
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
