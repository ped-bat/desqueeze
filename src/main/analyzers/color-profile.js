/**
 * ColorProfile - Color space identification, matrix selection, and illuminant logic
 *
 * Extracts and encapsulates all color science decisions:
 * - Color space detection from ICC profiles and EXIF data
 * - Correct XYZ-to-RGB matrix selection per color space
 * - Illuminant determination
 * - Dual-illuminant requirement detection
 *
 * Fixes from the previous implementation:
 * - Display P3, Rec. 2020, and ProPhoto RGB now use their own matrices
 *   instead of incorrectly falling through to sRGB.
 * - Redundant D65 logic in _needsDualIlluminant has been simplified.
 */

import log from "../logger.js";

/**
 * @typedef {Object} ColorSpaceInfo
 * @property {string} name - Human-readable color space name
 * @property {number|string} gamma - Gamma value or "sRGB" for sRGB transfer function
 * @property {string} matrix - DNGLab matrix identifier for single-illuminant use
 */

/**
 * @typedef {Object} ColorDepthInfo
 * @property {number} bits - Bit depth (8, 16, 32, 64)
 * @property {string} prefix - DNGLab bit prefix ("8bit" or "16bit")
 */

/** Known color space definitions with correct matrices */
const COLOR_SPACES = {
	sRGB: { name: "sRGB", gamma: "sRGB", matrix: "XYZ_sRGB_D65" },
	adobeRGB: { name: "Adobe RGB", gamma: 2.2, matrix: "XYZ_AdobeRGB_D65" },
	displayP3: { name: "Display P3", gamma: "sRGB", matrix: "XYZ_P3_D65" },
	proPhotoRGB: { name: "ProPhoto RGB", gamma: 1.8, matrix: "XYZ_ProPhoto_D50" },
	rec709: { name: "Rec. 709", gamma: "sRGB", matrix: "XYZ_Rec709_D65" },
	rec2020: { name: "Rec. 2020", gamma: 2.4, matrix: "XYZ_Rec2020_D65" },
	linear: { name: "Linear", gamma: 1.0, matrix: "XYZ_sRGB_D65" },
};

/** Map Sharp depth strings to bit depth info */
const DEPTH_MAP = {
	uchar: { bits: 8, prefix: "8bit" },
	uint8: { bits: 8, prefix: "8bit" },
	ushort: { bits: 16, prefix: "16bit" },
	uint16: { bits: 16, prefix: "16bit" },
	float: { bits: 32, prefix: "16bit" },
	double: { bits: 64, prefix: "16bit" },
};

class ColorProfile {
	/**
	 * @param {Object} params
	 * @param {import("sharp").Metadata} params.sharpMeta - Sharp metadata
	 * @param {Object|null} params.iccProfile - Parsed ICC profile (from `icc` package)
	 * @param {Object} params.exifData - EXIF data from exiftool
	 */
	constructor({ sharpMeta, iccProfile, exifData }) {
		this._sharpMeta = sharpMeta;
		this._iccProfile = iccProfile;
		this._exifData = exifData;

		// Eagerly compute all properties
		this.colorDepth = this._resolveColorDepth();
		this.illuminant = this._resolveIlluminant();
		this.colorSpace = this._resolveColorSpace();
		this.connectionSpace = this._resolveConnectionSpace();
		this.needsDualIlluminant = this._resolveNeedsDualIlluminant();
	}

	// ========================================================================
	// Color Depth
	// ========================================================================

	/**
	 * Resolve color depth from Sharp's depth property.
	 * @returns {ColorDepthInfo}
	 */
	_resolveColorDepth() {
		const depth = this._sharpMeta.depth;
		return DEPTH_MAP[depth] || { bits: 8, prefix: "8bit" };
	}

	// ========================================================================
	// Illuminant
	// ========================================================================

	/**
	 * Determine the illuminant (white point standard) from the ICC profile
	 * or EXIF data. Falls back to D65 which is the standard for most
	 * display-referred content.
	 * @returns {string}
	 */
	_resolveIlluminant() {
		// Check ICC profile illuminant field directly
		if (this._iccProfile?.illuminant) {
			return this._iccProfile.illuminant;
		}

		const profileDesc = this._getProfileDescription();

		if (profileDesc.includes("d50") || profileDesc.includes("prophoto")) {
			return "D50";
		}
		if (profileDesc.includes("d55")) {
			return "D55";
		}
		if (profileDesc.includes("d75")) {
			return "D75";
		}
		// D65: sRGB, Adobe RGB, Display P3, Rec. 709, Rec. 2020
		if (
			profileDesc.includes("d65") ||
			profileDesc.includes("srgb") ||
			profileDesc.includes("adobe") ||
			profileDesc.includes("display p3") ||
			profileDesc.includes("rec709") ||
			profileDesc.includes("rec2020")
		) {
			return "D65";
		}

		return "D65";
	}

	// ========================================================================
	// Color Space
	// ========================================================================

	/**
	 * Identify the color space and return its properties.
	 * Each color space now maps to its own correct XYZ matrix.
	 * @returns {ColorSpaceInfo}
	 */
	_resolveColorSpace() {
		const profileDesc = this._getProfileDescription();
		const sharpSpace = (this._sharpMeta.space || "").toLowerCase();

		// sRGB (includes IEC61966-2.1)
		if (
			profileDesc.includes("srgb") ||
			profileDesc.includes("iec61966") ||
			sharpSpace === "srgb"
		) {
			return { ...COLOR_SPACES.sRGB };
		}

		// Adobe RGB
		if (profileDesc.includes("adobe rgb") || profileDesc.includes("adobergb")) {
			return { ...COLOR_SPACES.adobeRGB };
		}

		// Display P3 — has different primaries from sRGB
		if (profileDesc.includes("display p3") || profileDesc.includes("p3")) {
			return { ...COLOR_SPACES.displayP3 };
		}

		// ProPhoto RGB / ROMM — very wide gamut, D50 native
		if (profileDesc.includes("prophoto") || profileDesc.includes("romm")) {
			return { ...COLOR_SPACES.proPhotoRGB };
		}

		// Rec. 709 — same primaries as sRGB, slightly different transfer
		if (profileDesc.includes("rec709") || profileDesc.includes("bt.709")) {
			return { ...COLOR_SPACES.rec709 };
		}

		// Rec. 2020 — very wide gamut, different primaries from sRGB
		if (profileDesc.includes("rec2020") || profileDesc.includes("bt.2020")) {
			return { ...COLOR_SPACES.rec2020 };
		}

		// Linear
		if (profileDesc.includes("linear")) {
			return { ...COLOR_SPACES.linear };
		}

		// EXIF ColorSpace tag as fallback
		const exifColorSpace = this._exifData.ColorSpace;
		if (exifColorSpace === "sRGB" || exifColorSpace === 1) {
			return { ...COLOR_SPACES.sRGB };
		}
		if (exifColorSpace === "Adobe RGB" || exifColorSpace === 2) {
			return { ...COLOR_SPACES.adobeRGB };
		}

		log.warn("Unknown color profile — defaulting to sRGB.");
		return { name: "sRGB (assumed)", gamma: "sRGB", matrix: "XYZ_sRGB_D65" };
	}

	// ========================================================================
	// Connection Space (PCS)
	// ========================================================================

	/**
	 * Get Profile Connection Space (PCS). By ICC spec this is always D50-adapted
	 * XYZ or Lab, but we read the actual value for completeness.
	 * @returns {string}
	 */
	_resolveConnectionSpace() {
		if (this._iccProfile?.connectionSpace) {
			return this._iccProfile.connectionSpace.trim();
		}
		if (this._exifData.ProfileConnectionSpace) {
			return this._exifData.ProfileConnectionSpace.trim();
		}
		return "XYZ";
	}

	// ========================================================================
	// Dual Illuminant
	// ========================================================================

	/**
	 * Determine if a dual-illuminant DNG profile is needed.
	 *
	 * Dual-illuminant is needed when the source color space uses a different
	 * white point than D50 (the ICC PCS standard). This applies to all D65
	 * spaces: sRGB, Adobe RGB, Display P3, Rec. 709, Rec. 2020.
	 *
	 * A dual-illuminant profile provides calibration at both D50 and the
	 * source illuminant, enabling proper chromatic adaptation.
	 *
	 * @returns {boolean}
	 */
	_resolveNeedsDualIlluminant() {
		// Any non-D50 illuminant benefits from dual-illuminant calibration
		return this.illuminant !== "D50";
	}

	// ========================================================================
	// Helpers
	// ========================================================================

	/**
	 * Get the normalized profile description string for matching.
	 * @returns {string}
	 */
	_getProfileDescription() {
		return (
			this._iccProfile?.description ||
			this._exifData.ProfileDescription ||
			""
		).toLowerCase();
	}

	/**
	 * Get the ICC profile name/description.
	 * @returns {string|null}
	 */
	getProfileName() {
		return (
			this._iccProfile?.description ||
			this._exifData.ProfileDescription ||
			null
		);
	}
}

export { ColorProfile, COLOR_SPACES, DEPTH_MAP };
