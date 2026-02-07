#!/usr/bin/env node

/**
 * Image Inspector - Extracts all available metadata from an image
 * Usage: node inspect-image.js <image-path>
 */

import sharp from "sharp";
import { exiftool } from "exiftool-vendored";
import icc from "icc";

const imagePath = process.argv[2];

if (!imagePath) {
	console.log("Usage: node inspect-image.js <image-path>");
	process.exit(1);
}

console.log("=".repeat(80));
console.log("IMAGE INSPECTOR");
console.log("=".repeat(80));
console.log(`\nFile: ${imagePath}\n`);

// ============================================================================
// SHARP METADATA
// ============================================================================
console.log("-".repeat(80));
console.log("SHARP METADATA");
console.log("-".repeat(80));

try {
	const image = sharp(imagePath);
	const metadata = await image.metadata();
	const stats = await image.stats();

	console.log("\n[Basic Info]");
	console.log(`  Format:      ${metadata.format}`);
	console.log(`  Width:       ${metadata.width}`);
	console.log(`  Height:      ${metadata.height}`);
	console.log(`  Space:       ${metadata.space}`);
	console.log(`  Channels:    ${metadata.channels}`);
	console.log(`  Depth:       ${metadata.depth}`);
	console.log(`  Density:     ${metadata.density} DPI`);
	console.log(`  Has Alpha:   ${metadata.hasAlpha}`);
	console.log(`  Has Profile: ${metadata.hasProfile}`);
	console.log(`  Orientation: ${metadata.orientation}`);

	console.log("\n[Color Info]");
	console.log(`  isProgressive: ${metadata.isProgressive}`);
	console.log(`  chromaSubsampling: ${metadata.chromaSubsampling}`);
	console.log(`  compression: ${metadata.compression}`);
	console.log(`  resolutionUnit: ${metadata.resolutionUnit}`);

	console.log("\n[Channel Statistics]");
	stats.channels.forEach((ch, i) => {
		const names = ["R/Gray", "G", "B", "A"];
		console.log(`  ${names[i] || `Ch${i}`}:`);
		console.log(`    min: ${ch.min}, max: ${ch.max}`);
		console.log(`    mean: ${ch.mean.toFixed(2)}, stdev: ${ch.stdev.toFixed(2)}`);
	});

	// Parse ICC profile if present
	if (metadata.icc) {
		console.log("\n[ICC Profile - Raw Buffer]");
		console.log(`  Size: ${metadata.icc.length} bytes`);

		try {
			const iccProfile = icc.parse(metadata.icc);
			console.log("\n[ICC Profile - Parsed]");
			console.log(`  Description:        ${iccProfile.description}`);
			console.log(`  Color Space:        ${iccProfile.colorSpace}`);
			console.log(`  Profile Connection: ${iccProfile.connectionSpace}`);
			console.log(`  Device Class:       ${iccProfile.deviceClass}`);
			console.log(`  Creator:            ${iccProfile.creator}`);
			console.log(`  Version:            ${iccProfile.version}`);
			console.log(`  Rendering Intent:   ${iccProfile.intent}`);

			if (iccProfile.whitepoint) {
				console.log(`  White Point:        X=${iccProfile.whitepoint[0]?.toFixed(6)}, Y=${iccProfile.whitepoint[1]?.toFixed(6)}, Z=${iccProfile.whitepoint[2]?.toFixed(6)}`);
			}

			// Check for illuminant info
			if (iccProfile.illuminant) {
				console.log(`  Illuminant:         ${JSON.stringify(iccProfile.illuminant)}`);
			}

			// Check for chromatic adaptation
			if (iccProfile.chromaticAdaptation) {
				console.log(`  Chromatic Adapt:    ${JSON.stringify(iccProfile.chromaticAdaptation)}`);
			}

			// Red, Green, Blue primaries
			if (iccProfile.red) {
				console.log(`  Red Primary:        X=${iccProfile.red.X?.toFixed(6)}, Y=${iccProfile.red.Y?.toFixed(6)}, Z=${iccProfile.red.Z?.toFixed(6)}`);
			}
			if (iccProfile.green) {
				console.log(`  Green Primary:      X=${iccProfile.green.X?.toFixed(6)}, Y=${iccProfile.green.Y?.toFixed(6)}, Z=${iccProfile.green.Z?.toFixed(6)}`);
			}
			if (iccProfile.blue) {
				console.log(`  Blue Primary:       X=${iccProfile.blue.X?.toFixed(6)}, Y=${iccProfile.blue.Y?.toFixed(6)}, Z=${iccProfile.blue.Z?.toFixed(6)}`);
			}

			// TRC (Transfer Response Curve / Gamma)
			if (iccProfile.redTRC || iccProfile.greenTRC || iccProfile.blueTRC || iccProfile.grayTRC) {
				console.log("\n[Transfer Response Curves (Gamma)]");
				if (iccProfile.redTRC) {
					console.log(`  Red TRC:   ${describeTRC(iccProfile.redTRC)}`);
				}
				if (iccProfile.greenTRC) {
					console.log(`  Green TRC: ${describeTRC(iccProfile.greenTRC)}`);
				}
				if (iccProfile.blueTRC) {
					console.log(`  Blue TRC:  ${describeTRC(iccProfile.blueTRC)}`);
				}
				if (iccProfile.grayTRC) {
					console.log(`  Gray TRC:  ${describeTRC(iccProfile.grayTRC)}`);
				}
			}

			// Print all available keys for exploration
			console.log("\n[ICC Profile - All Keys]");
			console.log(`  ${Object.keys(iccProfile).join(", ")}`);

		} catch (iccError) {
			console.log(`  Parse error: ${iccError.message}`);
			console.log(`  First 100 bytes (hex): ${metadata.icc.slice(0, 100).toString("hex")}`);
		}
	} else {
		console.log("\n[ICC Profile]");
		console.log("  No ICC profile embedded");
	}

	// Print all Sharp metadata keys
	console.log("\n[Sharp Metadata - All Keys]");
	console.log(`  ${Object.keys(metadata).filter(k => k !== "icc").join(", ")}`);

} catch (err) {
	console.log(`Sharp error: ${err.message}`);
}

// ============================================================================
// EXIFTOOL METADATA (Color-related)
// ============================================================================
console.log("\n" + "-".repeat(80));
console.log("EXIFTOOL METADATA (Color-Related)");
console.log("-".repeat(80));

try {
	const exif = await exiftool.read(imagePath);

	const colorTags = [
		// Profile info
		"ProfileDescription",
		"ProfileName",
		"ProfileVersion",
		"ProfileClass",
		"ColorSpaceData",
		"ProfileConnectionSpace",
		"ProfileCreator",
		"ProfileDateTime",
		"ProfileFileSignature",
		"ProfileCMMType",
		"ProfileID",

		// Color space
		"ColorSpace",
		"ColorMode",
		"ColorType",
		"ColorComponents",
		"ColorModel",
		"PhotometricInterpretation",

		// Gamma / Transfer
		"Gamma",
		"GammaValue",
		"TransferFunction",
		"ColorTone",

		// White point / Illuminant
		"WhitePoint",
		"WhitePointX",
		"WhitePointY",
		"ReferenceWhite",
		"Illuminant",
		"LightSource",
		"CalibrationIlluminant1",
		"CalibrationIlluminant2",

		// Primaries / Matrix
		"PrimaryChromaticities",
		"RedPrimary",
		"GreenPrimary",
		"BluePrimary",
		"RedMatrixColumn",
		"GreenMatrixColumn",
		"BlueMatrixColumn",
		"ColorMatrix1",
		"ColorMatrix2",
		"CameraCalibration1",
		"CameraCalibration2",
		"ForwardMatrix1",
		"ForwardMatrix2",

		// Bit depth
		"BitsPerSample",
		"BitDepth",
		"ColorBitDepth",
		"SampleFormat",
		"ComponentsConfiguration",
		"CompressedBitsPerPixel",

		// Other color info
		"YCbCrSubSampling",
		"YCbCrPositioning",
		"YCbCrCoefficients",
		"ReferenceBlackWhite",
		"ICCProfileName",
		"InteropIndex",
		"ChromaticAdaptation",
	];

	console.log("\n[Color-Related Tags]");
	let foundTags = 0;
	for (const tag of colorTags) {
		if (exif[tag] !== undefined) {
			const value = typeof exif[tag] === "object" ? JSON.stringify(exif[tag]) : exif[tag];
			console.log(`  ${tag}: ${value}`);
			foundTags++;
		}
	}

	if (foundTags === 0) {
		console.log("  No specific color tags found");
	}

	// Print all EXIF keys for reference
	console.log("\n[All EXIF Tags Available]");
	const allKeys = Object.keys(exif).sort();
	console.log(`  Total: ${allKeys.length} tags`);
	console.log(`  ${allKeys.join(", ")}`);

} catch (err) {
	console.log(`Exiftool error: ${err.message}`);
}

// ============================================================================
// SUMMARY & RECOMMENDATIONS
// ============================================================================
console.log("\n" + "=".repeat(80));
console.log("DNG CONVERSION RECOMMENDATIONS");
console.log("=".repeat(80));

try {
	const image = sharp(imagePath);
	const metadata = await image.metadata();

	// Get profile from what we already know (don't call exiftool again)
	const profile = metadata.space || "srgb";
	const depth = metadata.depth;
	const is16bit = depth === "ushort" || depth === "uint16";
	const bitPrefix = is16bit ? "16bit" : "8bit";

	console.log(`\nDetected Space:   ${profile}`);
	console.log(`Detected Depth:   ${depth} (${bitPrefix})`);

	let matrix, illuminant, linearization;

	const profileLower = profile.toLowerCase();
	if (profileLower.includes("srgb") || profileLower.includes("iec61966")) {
		matrix = "XYZ_sRGB_D65";
		illuminant = "D65";
		linearization = `${bitPrefix}_sRGB_invert`;
	} else if (profileLower.includes("adobe") || profileLower.includes("adobergb")) {
		matrix = "XYZ_AdobeRGB_D65";
		illuminant = "D65";
		linearization = `${bitPrefix}_gamma2.2_invert`;
	} else if (profileLower.includes("p3") || profileLower.includes("display p3")) {
		matrix = "XYZ_sRGB_D65";
		illuminant = "D65";
		linearization = `${bitPrefix}_sRGB_invert`;
	} else if (profileLower.includes("prophoto") || profileLower.includes("romm")) {
		matrix = "XYZ_sRGB_D50";
		illuminant = "D50";
		linearization = `${bitPrefix}_gamma1.8_invert`;
	} else {
		matrix = "XYZ_sRGB_D65";
		illuminant = "D65";
		linearization = `${bitPrefix}_sRGB_invert`;
		console.log(`\n⚠️  Unknown profile - defaulting to sRGB`);
	}

	console.log(`\nRecommended dnglab makedng options:`);
	console.log(`  --matrix1 ${matrix}`);
	console.log(`  --illuminant1 ${illuminant}`);
	console.log(`  --linearization ${linearization}`);
	console.log(`  --colorimetric-reference output`);

	console.log(`\nFull command:`);
	console.log(`  dnglab makedng -i "${imagePath}" -o "output.dng" --matrix1 ${matrix} --illuminant1 ${illuminant} --linearization ${linearization} --colorimetric-reference output --override`);

} catch (err) {
	console.log(`Recommendation error: ${err.message}`);
}

console.log("\n" + "=".repeat(80));

// Cleanup exiftool at the very end
await exiftool.end();

// Helper function to describe TRC
function describeTRC(trc) {
	if (typeof trc === "number") {
		return `Gamma ${trc.toFixed(4)}`;
	} else if (Array.isArray(trc)) {
		if (trc.length === 1) {
			return `Gamma ${trc[0].toFixed(4)}`;
		} else {
			return `LUT with ${trc.length} entries (first: ${trc[0]?.toFixed(4)}, last: ${trc[trc.length - 1]?.toFixed(4)})`;
		}
	} else if (trc && typeof trc === "object") {
		return JSON.stringify(trc);
	}
	return String(trc);
}
