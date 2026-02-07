/**
 * ImageAnalyzer - Extracts metadata from image files for DNG conversion
 *
 * Provides clean separation between metadata extraction and command building.
 * Uses Sharp for image data and exiftool for EXIF/ICC metadata.
 */

import sharp from "sharp";
import icc from "icc";
import { exiftool } from "exiftool-vendored";

class ImageAnalyzer {
	constructor(filePath) {
		this.filePath = filePath;
		this.metadata = null;
	}

	/**
	 * Analyze the image and return all relevant metadata
	 * @returns {Promise<Object>} Complete metadata object
	 */
	async analyze() {
		// Get Sharp metadata (includes ICC buffer)
		const image = sharp(this.filePath);
		const sharpMeta = await image.metadata();

		// Get EXIF data
		const exifData = await exiftool.read(this.filePath);

		// Parse ICC profile if available
		let iccProfile = null;
		if (sharpMeta.icc) {
			try {
				iccProfile = icc.parse(sharpMeta.icc);
			} catch (e) {
				console.warn("Failed to parse ICC profile:", e.message);
			}
		}

		// Extract individual metadata fields
		const colorDepth = this._getColorDepth(sharpMeta);
		const illuminant = this._getIlluminant(iccProfile, exifData);
		const colorSpace = this._getColorSpace(sharpMeta, iccProfile, exifData);
		const connectionSpace = this._getConnectionSpace(iccProfile, exifData);
		const iccProfileName = this._getICCProfileName(iccProfile, exifData);
		
		// Determine if dual-illuminant is needed
		// ICC PCS is always D50, but source may be D65 (sRGB, Adobe RGB)
		// Dual-illuminant provides better color accuracy by calibrating at both points
		const needsDualIlluminant = this._needsDualIlluminant(illuminant, connectionSpace);

		// Build metadata object
		this.metadata = {
			// Core color properties
			colorDepth,
			illuminant,
			colorSpace,
			connectionSpace,
			iccProfile: iccProfileName,
			needsDualIlluminant,

			// Image dimensions
			width: sharpMeta.width,
			height: sharpMeta.height,
			channels: sharpMeta.channels,
			hasAlpha: sharpMeta.hasAlpha,
			format: sharpMeta.format,

			// Raw data for debugging/advanced use
			_raw: {
				sharp: sharpMeta,
				icc: iccProfile,
				exif: exifData,
			},
		};

		return this.metadata;
	}

	/**
	 * Get color depth from Sharp metadata
	 * Sharp's depth property directly tells us bit depth
	 */
	_getColorDepth(sharpMeta) {
		const depth = sharpMeta.depth;

		// Map Sharp depth values to bit depth
		const depthMap = {
			uchar: { bits: 8, prefix: "8bit" },
			uint8: { bits: 8, prefix: "8bit" },
			ushort: { bits: 16, prefix: "16bit" },
			uint16: { bits: 16, prefix: "16bit" },
			float: { bits: 32, prefix: "16bit" }, // Use 16bit for float in dnglab
			double: { bits: 64, prefix: "16bit" },
		};

		return depthMap[depth] || { bits: 8, prefix: "8bit" };
	}

	/**
	 * Get illuminant from ICC profile
	 * Most ICC profiles specify the illuminant directly in the description
	 */
	_getIlluminant(iccProfile, exifData) {
		// Check if ICC profile has illuminant directly
		if (iccProfile?.illuminant) {
			return iccProfile.illuminant;
		}

		// Infer from profile description
		const profileDesc = (
			iccProfile?.description ||
			exifData.ProfileDescription ||
			""
		).toLowerCase();

		if (profileDesc.includes("d50") || profileDesc.includes("prophoto")) {
			return "D50";
		}
		if (profileDesc.includes("d55")) {
			return "D55";
		}
		if (profileDesc.includes("d75")) {
			return "D75";
		}
		// D65 is standard for sRGB, Adobe RGB, and most display profiles
		if (
			profileDesc.includes("d65") ||
			profileDesc.includes("srgb") ||
			profileDesc.includes("adobe")
		) {
			return "D65";
		}

		// Default to D65 (most common for display-referred content)
		return "D65";
	}

	/**
	 * Get color space information
	 * Returns name and gamma for linearization purposes
	 */
	_getColorSpace(sharpMeta, iccProfile, exifData) {
		const profileDesc = (
			iccProfile?.description ||
			exifData.ProfileDescription ||
			""
		).toLowerCase();
		const sharpSpace = (sharpMeta.space || "").toLowerCase();

		// sRGB (includes IEC61966-2.1)
		if (
			profileDesc.includes("srgb") ||
			profileDesc.includes("iec61966") ||
			sharpSpace === "srgb"
		) {
			return { name: "sRGB", gamma: "sRGB", matrix: "XYZ_sRGB_D65" };
		}

		// Adobe RGB
		if (profileDesc.includes("adobe rgb") || profileDesc.includes("adobergb")) {
			return { name: "Adobe RGB", gamma: 2.2, matrix: "XYZ_AdobeRGB_D65" };
		}

		// Display P3
		if (profileDesc.includes("display p3") || profileDesc.includes("p3")) {
			return { name: "Display P3", gamma: "sRGB", matrix: "XYZ_sRGB_D65" };
		}

		// ProPhoto RGB / ROMM
		if (profileDesc.includes("prophoto") || profileDesc.includes("romm")) {
			return { name: "ProPhoto RGB", gamma: 1.8, matrix: "XYZ_sRGB_D50" };
		}

		// Rec. 709
		if (profileDesc.includes("rec709") || profileDesc.includes("bt.709")) {
			return { name: "Rec. 709", gamma: "sRGB", matrix: "XYZ_sRGB_D65" };
		}

		// Rec. 2020
		if (profileDesc.includes("rec2020") || profileDesc.includes("bt.2020")) {
			return { name: "Rec. 2020", gamma: 2.4, matrix: "XYZ_sRGB_D65" };
		}

		// Linear
		if (profileDesc.includes("linear")) {
			return { name: "Linear", gamma: 1.0, matrix: "XYZ_sRGB_D65" };
		}

		// Check EXIF ColorSpace tag as fallback
		const exifColorSpace = exifData.ColorSpace;
		if (exifColorSpace === "sRGB" || exifColorSpace === 1) {
			return { name: "sRGB", gamma: "sRGB", matrix: "XYZ_sRGB_D65" };
		}
		if (exifColorSpace === "Adobe RGB" || exifColorSpace === 2) {
			return { name: "Adobe RGB", gamma: 2.2, matrix: "XYZ_AdobeRGB_D65" };
		}

		// Default to sRGB
		return { name: "sRGB (assumed)", gamma: "sRGB", matrix: "XYZ_sRGB_D65" };
	}

	/**
	 * Get profile connection space (PCS) - typically XYZ or Lab
	 */
	_getConnectionSpace(iccProfile, exifData) {
		if (iccProfile?.connectionSpace) {
			return iccProfile.connectionSpace.trim();
		}
		if (exifData.ProfileConnectionSpace) {
			return exifData.ProfileConnectionSpace.trim();
		}
		return "XYZ"; // Default
	}

	/**
	 * Get ICC profile name/description
	 */
	_getICCProfileName(iccProfile, exifData) {
		return iccProfile?.description || exifData.ProfileDescription || null;
	}

	/**
	 * Determine if dual-illuminant DNG profile is needed
	 * 
	 * ICC Profile Connection Space (PCS) is always D50 by specification.
	 * But common color spaces like sRGB and Adobe RGB use D65 primaries.
	 * The ICC profile has a built-in chromatic adaptation matrix (D65→D50).
	 * 
	 * For accurate DNG conversion, we need dual-illuminant when:
	 * - Source illuminant is D65 (or other non-D50)
	 * - Connection space is XYZ (D50)
	 * 
	 * This provides calibration at both D50 and D65, allowing proper
	 * chromatic adaptation in the DNG processor.
	 */
	_needsDualIlluminant(illuminant, connectionSpace) {
		// If source is D65 and PCS is XYZ (D50), we need dual illuminant
		if (illuminant === "D65" && connectionSpace === "XYZ") {
			return true;
		}
		// Adobe RGB also needs dual illuminant
		if (illuminant === "D65") {
			return true;
		}
		return false;
	}

	/**
	 * Print a summary of the analyzed metadata
	 */
	printSummary() {
		if (!this.metadata) {
			console.log("No metadata available. Call analyze() first.");
			return;
		}

		const m = this.metadata;
		console.log("Image Analysis:");
		console.log(`  File:             ${this.filePath}`);
		console.log(`  Dimensions:       ${m.width}x${m.height}`);
		console.log(`  Format:           ${m.format}`);
		console.log(`  Color Depth:      ${m.colorDepth.bits}-bit`);
		console.log(`  Color Space:      ${m.colorSpace.name}`);
		console.log(`  Illuminant:       ${m.illuminant}`);
		console.log(`  Connection Space: ${m.connectionSpace}`);
		console.log(`  ICC Profile:      ${m.iccProfile || "None"}`);
		console.log(`  Dual Illuminant:  ${m.needsDualIlluminant ? "Yes" : "No"}`);
	}
}

export { ImageAnalyzer };
