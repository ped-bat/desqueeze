/**
 * DngCommandBuilder - Constructs dnglab makedng commands from image metadata
 *
 * Takes analyzed metadata and builds appropriate dnglab makedng command arrays.
 * Each section is built via a dedicated method for clarity and testability.
 *
 * Matrix and illuminant selection is decided by ColorProfile (see
 * analyzers/color-profile.js for the dnglab matrix constraints).
 * Dual-illuminant profiles enable proper D65↔D50 chromatic adaptation.
 */

class DngCommandBuilder {
	/**
	 * Build complete dnglab makedng command array from image metadata.
	 * @param {Object} metadata - Metadata object from ImageAnalyzer
	 * @param {string} inputPath - Path to input file
	 * @param {string} outputPath - Path for output DNG
	 * @returns {string[]} Complete command arguments array
	 */
	build(metadata, inputPath, outputPath) {
		if (!metadata || !metadata.colorDepth || !metadata.colorSpace) {
			throw new Error("Invalid metadata: missing required color properties.");
		}
		if (!inputPath || !outputPath) {
			throw new Error("Both inputPath and outputPath are required.");
		}

		const sections = [
			this._buildBaseSection(inputPath, outputPath),
			this._buildMatrixSection(metadata),
			this._buildIlluminantSection(metadata),
			this._buildLinearizationSection(metadata.colorDepth, metadata.colorSpace),
			this._buildColorimetricSection(),
			this._buildOptionsSection(),
		];

		return sections.flat().filter(Boolean);
	}

	// ========================================================================
	// Section Builders (private)
	// ========================================================================

	/** Base command with input/output paths */
	_buildBaseSection(inputPath, outputPath) {
		return ["makedng", "-i", inputPath, "-o", outputPath];
	}

	/**
	 * Color matrix section.
	 * For dual-illuminant: matrix1 (D50) + matrix2 (D65) from the space's matrix family.
	 * For single-illuminant: the space's own matrix.
	 */
	_buildMatrixSection(metadata) {
		if (metadata.needsDualIlluminant) {
			const base = metadata.colorSpace?.matrixBase || "XYZ_sRGB";
			return ["--matrix1", `${base}_D50`, "--matrix2", `${base}_D65`];
		}

		const matrix = metadata.colorSpace?.matrix || "XYZ_sRGB_D65";
		return ["--matrix1", matrix];
	}

	/**
	 * Illuminant section.
	 * For dual-illuminant: D50 + D65.
	 * For single-illuminant: metadata illuminant only.
	 */
	_buildIlluminantSection(metadata) {
		if (metadata.needsDualIlluminant) {
			return ["--illuminant1", "D50", "--illuminant2", "D65"];
		}
		return ["--illuminant1", metadata.illuminant || "D65"];
	}

	/**
	 * Linearization section based on color depth and gamma.
	 * Linear images (gamma 1.0) don't need linearization.
	 */
	_buildLinearizationSection(colorDepth, colorSpace) {
		const bitPrefix = colorDepth?.prefix || "8bit";
		const gamma = colorSpace?.gamma;

		const linearization = this._resolveLinearization(bitPrefix, gamma);
		return linearization ? ["--linearization", linearization] : [];
	}

	/** Colorimetric reference — always "output" for display-referred content */
	_buildColorimetricSection() {
		return ["--colorimetric-reference", "output"];
	}

	/** Additional options */
	_buildOptionsSection() {
		return ["--override"];
	}

	// ========================================================================
	// Helpers
	// ========================================================================

	/**
	 * Map gamma value to a dnglab linearization string.
	 * @param {string} bitPrefix - "8bit" or "16bit"
	 * @param {number|string} gamma - Gamma value or "sRGB"
	 * @returns {string|null}
	 */
	_resolveLinearization(bitPrefix, gamma) {
		if (gamma === 1.0) return null;

		const gammaMap = {
			sRGB: "sRGB",
			1.8: "gamma1.8",
			2.2: "gamma2.2",
			2.4: "gamma2.4",
		};

		const gammaKey = String(gamma);
		const gammaSuffix = gammaMap[gammaKey] || "sRGB";
		return `${bitPrefix}_${gammaSuffix}_invert`;
	}
}

export { DngCommandBuilder };
