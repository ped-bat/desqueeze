/**
 * ImageAnalyzer - Extracts and aggregates image metadata for DNG conversion
 *
 * Delegates color-science decisions to ColorProfile.
 * Uses SharpService and ExifToolService (injected) instead of raw imports.
 */

import icc from "icc";
import log from "../logger.js";
import { SharpService } from "../services/sharp-service.js";
import { ExifToolService } from "../services/exiftool-service.js";
import { ColorProfile } from "./color-profile.js";
import { validateFilePath } from "../utils/validation.js";

class ImageAnalyzer {
	/**
	 * @param {string} filePath - Absolute path to the image file
	 * @param {Object} [deps] - Injectable dependencies (for testing)
	 * @param {SharpService} [deps.sharpService]
	 * @param {ExifToolService} [deps.exifToolService]
	 */
	constructor(filePath, deps = {}) {
		validateFilePath(filePath);
		this.filePath = filePath;
		this.metadata = null;

		this._sharp = deps.sharpService || new SharpService();
		this._exiftool = deps.exifToolService || ExifToolService.getInstance();
	}

	/**
	 * Analyze the image and return all relevant metadata.
	 * @returns {Promise<Object>} Complete metadata object
	 */
	async analyze() {
		// Extract raw data from all sources
		const sharpMeta = await this._sharp.getMetadata(this.filePath);
		const exifData = await this._exiftool.read(this.filePath);

		// Parse ICC profile if available
		let iccProfile = null;
		if (sharpMeta.icc) {
			try {
				iccProfile = icc.parse(sharpMeta.icc);
			} catch (e) {
				log.warn(`Failed to parse ICC profile: ${e.message}`);
			}
		}

		// Delegate color science to ColorProfile
		const profile = new ColorProfile({ sharpMeta, iccProfile, exifData });

		// Assemble metadata object
		this.metadata = {
			// Color properties (from ColorProfile)
			colorDepth: profile.colorDepth,
			illuminant: profile.illuminant,
			colorSpace: profile.colorSpace,
			connectionSpace: profile.connectionSpace,
			iccProfile: profile.getProfileName(),
			needsDualIlluminant: profile.needsDualIlluminant,

			// Image dimensions (from Sharp)
			width: sharpMeta.width,
			height: sharpMeta.height,
			channels: sharpMeta.channels,
			hasAlpha: sharpMeta.hasAlpha,
			format: sharpMeta.format,

			// Raw data for debugging / advanced use
			_raw: {
				sharp: sharpMeta,
				icc: iccProfile,
				exif: exifData,
			},
		};

		return this.metadata;
	}

	/**
	 * Log a summary of the analyzed metadata.
	 */
	printSummary() {
		if (!this.metadata) {
			log.warn("No metadata available. Call analyze() first.");
			return;
		}

		const m = this.metadata;
		log.info("Image Analysis:");
		log.info(`  File:             ${this.filePath}`);
		log.info(`  Dimensions:       ${m.width}×${m.height}`);
		log.info(`  Format:           ${m.format}`);
		log.info(`  Color Depth:      ${m.colorDepth.bits}-bit`);
		log.info(`  Color Space:      ${m.colorSpace.name}`);
		log.info(`  Illuminant:       ${m.illuminant}`);
		log.info(`  Connection Space: ${m.connectionSpace}`);
		log.info(`  ICC Profile:      ${m.iccProfile || "None"}`);
		log.info(`  Dual Illuminant:  ${m.needsDualIlluminant ? "Yes" : "No"}`);
	}
}

export { ImageAnalyzer };
