/**
 * AppConfig - Centralized application configuration
 *
 * All constants, supported formats, and feature flags live here.
 * Shared between main process, IPC handlers, and renderer (via preload).
 */

class AppConfig {
	// ========================================================================
	// Supported Formats
	// ========================================================================

	/** Supported RAW formats for DNG conversion */
	static RAW_FORMATS = new Set([
		".3fr", ".ari", ".arw", ".cr2", ".cr3", ".crw",
		".dcr", ".dcs", ".dng", ".erf", ".iiq", ".kdc",
		".mef", ".mos", ".mrw", ".nef", ".nrw", ".orf",
		".pef", ".raf", ".raw", ".rw2", ".sr2", ".srf", ".srw",
	]);

	/** Supported bitmap formats for Sharp-based conversion */
	static BITMAP_FORMATS = new Set([
		".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp",
	]);

	/** Combined set of all supported formats */
	static get ALL_FORMATS() {
		return new Set([...AppConfig.RAW_FORMATS, ...AppConfig.BITMAP_FORMATS]);
	}

	/** File dialog extension list (without dots) */
	static get EXTENSIONS_LIST() {
		return Array.from(AppConfig.ALL_FORMATS).map((ext) => ext.replace(".", ""));
	}

	// ========================================================================
	// Defaults & Limits
	// ========================================================================

	/** Default horizontal ratio */
	static DEFAULT_RATIO_X = 1.33;

	/** Default vertical ratio */
	static DEFAULT_RATIO_Y = 1;

	/** Maximum allowed stretch factor (ratioX / ratioY) */
	static MAX_STRETCH_FACTOR = 5.0;

	/** Warn the user above this stretch factor */
	static STRETCH_WARN_THRESHOLD = 3.0;

	/** Maximum parallel file processing concurrency */
	static MAX_CONCURRENCY = 3;

	// ========================================================================
	// Output Formats
	// ========================================================================

	/**
	 * Available output formats with their default options.
	 * Keys match the <select> values in the renderer.
	 */
	static OUTPUT_FORMATS = {
		dng: {
			label: "DNG",
			ext: ".dng",
			options: {},
		},
		jpg: {
			label: "JPEG",
			ext: ".jpg",
			options: { quality: 95 },
		},
		png: {
			label: "PNG",
			ext: ".png",
			options: { compressionLevel: 6 },
		},
		tiff: {
			label: "TIFF",
			ext: ".tif",
			options: { compression: "lzw" },
		},
		webp: {
			label: "WebP",
			ext: ".webp",
			options: { quality: 90, lossless: false },
		},
	};

	/** Default output format key */
	static DEFAULT_OUTPUT_FORMAT = "dng";

	// ========================================================================
	// Feature Flags
	// ========================================================================

	/** Premium features enabled (batch processing, directory selection) */
	static PREMIUM = true;
}

export { AppConfig };
