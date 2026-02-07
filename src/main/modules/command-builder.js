/**
 * Command Builder - Constructs DNGLab commands from image metadata
 *
 * Takes analyzed metadata and builds appropriate dnglab makedng commands.
 * Each section of the command is built separately for clarity.
 * 
 * Supports dual-illuminant profiles for proper D65↔D50 chromatic adaptation.
 */

import { getDNGLabPath } from "./dng-utils.js";

// ============================================================================
// Command Section Builders
// ============================================================================

/**
 * Build the base command with input/output paths
 */
function buildBaseSection(inputPath, outputPath) {
	return ["makedng", "-i", inputPath, "-o", outputPath];
}

/**
 * Build the color matrix section based on color space
 * For dual-illuminant, returns both matrix1 (D50) and matrix2 (D65)
 * @param {Object} metadata - Full metadata from ImageAnalyzer
 */
function buildMatrixSection(metadata) {
	const colorSpace = metadata.colorSpace;
	const needsDual = metadata.needsDualIlluminant;
	
	// Determine base matrix type (sRGB or AdobeRGB)
	const isAdobeRGB = colorSpace?.name?.includes("Adobe");
	const baseMatrix = isAdobeRGB ? "XYZ_AdobeRGB" : "XYZ_sRGB";
	
	if (needsDual) {
		// Dual illuminant: D50 matrix for illuminant1, D65 matrix for illuminant2
		return ["--matrix1", `${baseMatrix}_D50`, "--matrix2", `${baseMatrix}_D65`];
	}
	
	// Single illuminant
	const matrix = colorSpace?.matrix || "XYZ_sRGB_D65";
	return ["--matrix1", matrix];
}

/**
 * Build the illuminant section
 * For dual-illuminant, returns both illuminant1 (D50) and illuminant2 (D65)
 * @param {Object} metadata - Full metadata from ImageAnalyzer
 */
function buildIlluminantSection(metadata) {
	const needsDual = metadata.needsDualIlluminant;
	
	if (needsDual) {
		// Dual illuminant: D50 + D65
		return ["--illuminant1", "D50", "--illuminant2", "D65"];
	}
	
	// Single illuminant
	return ["--illuminant1", metadata.illuminant || "D65"];
}

/**
 * Build the linearization section based on color depth and gamma
 * Uses _invert suffix for gamma-encoded images
 * @param {Object} colorDepth - Color depth metadata from ImageAnalyzer
 * @param {Object} colorSpace - Color space metadata from ImageAnalyzer
 */
function buildLinearizationSection(colorDepth, colorSpace) {
	const bitPrefix = colorDepth?.prefix || "8bit";
	const gamma = colorSpace?.gamma;

	// Linear images don't need linearization
	if (gamma === 1.0) {
		return [];
	}

	// Build linearization string based on gamma
	let linearization;
	if (gamma === "sRGB") {
		linearization = `${bitPrefix}_sRGB_invert`;
	} else if (gamma === 1.8) {
		linearization = `${bitPrefix}_gamma1.8_invert`;
	} else if (gamma === 2.2) {
		linearization = `${bitPrefix}_gamma2.2_invert`;
	} else if (gamma === 2.4) {
		linearization = `${bitPrefix}_gamma2.4_invert`;
	} else {
		// Default to sRGB for unknown gamma
		linearization = `${bitPrefix}_sRGB_invert`;
	}

	return ["--linearization", linearization];
}

/**
 * Build the colorimetric reference section
 * @param {string} connectionSpace - PCS from ICC profile (XYZ, Lab)
 */
function buildColorimetricSection(connectionSpace) {
	// Use "output" for display-referred content (most bitmaps)
	// Use "scene" for scene-referred content
	return ["--colorimetric-reference", "output"];
}

/**
 * Build additional options section
 */
function buildOptionsSection() {
	return ["--override"];
}

// ============================================================================
// Main Command Builder
// ============================================================================

/**
 * Build complete dnglab makedng command from image metadata
 * @param {Object} metadata - Metadata object from ImageAnalyzer
 * @param {string} inputPath - Path to input file
 * @param {string} outputPath - Path for output DNG
 * @returns {string} Complete command string
 */
function buildMakeDNGCommand(metadata, inputPath, outputPath) {
	// Build each section - now passing full metadata for dual-illuminant detection
	const sections = [
		buildBaseSection(inputPath, outputPath),
		buildMatrixSection(metadata),
		buildIlluminantSection(metadata),
		buildLinearizationSection(metadata.colorDepth, metadata.colorSpace),
		buildColorimetricSection(metadata.connectionSpace),
		buildOptionsSection(),
	];

	// Filter out empty arrays/nulls and flatten
	return sections.flat().filter(Boolean);
}

/**
 * Get command options as an object (for logging/debugging)
 * @param {Object} metadata - Metadata object from ImageAnalyzer
 * @returns {Object} Command options object
 */
function getCommandOptions(metadata) {
	const bitPrefix = metadata.colorDepth?.prefix || "8bit";
	const gamma = metadata.colorSpace?.gamma;
	const needsDual = metadata.needsDualIlluminant;

	let linearization = null;
	if (gamma !== 1.0) {
		if (gamma === "sRGB") {
			linearization = `${bitPrefix}_sRGB_invert`;
		} else if (gamma === 1.8) {
			linearization = `${bitPrefix}_gamma1.8_invert`;
		} else if (gamma === 2.2) {
			linearization = `${bitPrefix}_gamma2.2_invert`;
		} else if (gamma === 2.4) {
			linearization = `${bitPrefix}_gamma2.4_invert`;
		} else {
			linearization = `${bitPrefix}_sRGB_invert`;
		}
	}

	const isAdobeRGB = metadata.colorSpace?.name?.includes("Adobe");
	const baseMatrix = isAdobeRGB ? "XYZ_AdobeRGB" : "XYZ_sRGB";

	if (needsDual) {
		return {
			matrix1: `${baseMatrix}_D50`,
			matrix2: `${baseMatrix}_D65`,
			illuminant1: "D50",
			illuminant2: "D65",
			linearization,
			colorimetricReference: "output",
			dualIlluminant: true,
		};
	}

	return {
		matrix1: metadata.colorSpace?.matrix || "XYZ_sRGB_D65",
		illuminant1: metadata.illuminant || "D65",
		linearization,
		colorimetricReference: "output",
		dualIlluminant: false,
	};
}

export {
	buildMakeDNGCommand,
	getCommandOptions,
	// Export individual builders for testing/customization
	buildBaseSection,
	buildMatrixSection,
	buildIlluminantSection,
	buildLinearizationSection,
	buildColorimetricSection,
	buildOptionsSection,
};
