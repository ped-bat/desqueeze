import { ipc } from "../services/ipc.js";

/**
 * App lifecycle modes — these drive both the UI content and the
 * dot-grid engine animation (see core/config.js MODE_PARAMS).
 */
export const MODES = ["ready", "settings", "processing", "error", "success"];

/** Anamorphic factor presets shown in the settings dropdown */
export const FACTOR_PRESETS = [
	{ value: "1.33", label: "1.33x" },
	{ value: "1.5", label: "1.5x" },
	{ value: "2", label: "2x" },
	{ value: "custom", label: "Custom" },
];

const persist = (key, value) => localStorage.setItem(key, String(value));

/** Processing screen shows at least this long. Display-only: the elapsed
 * time reported on the success screen is the real processing time. Just
 * enough to let the crossfade finish instead of flashing for tiny batches. */
const MIN_PROCESSING_MS = 400;

/** Extract a display name from an absolute path (either separator style) */
const basename = (p) => String(p).split(/[\\/]/).pop();

/**
 * Singleton store: mode machine + settings + processing pipeline.
 * Emits "change" after every state update; components subscribe via
 * StoreController.
 */
class AppStore extends EventTarget {
	config = null; // RENDERER_CONFIG from the main process
	mode = "ready";

	factorPreset = "1.33";
	customFactor = "1.00";
	format = "dng";
	formatOptions = {};

	progress = { done: 0, total: 0 };
	result = null; // { successCount, failedCount, cancelledCount, elapsed, skippedCount, firstError, failures }
	pendingFiles = []; // queued by drop/browse, confirmed on the settings screen
	currentFile = ""; // basename of the most recently started file
	cancelRequested = false;

	async init() {
		this.config = await ipc.getConfig();

		// Live progress pushed from the main process (which file just started)
		ipc.onProcessingProgress(({ state, file }) => {
			if (state === "started") {
				this.currentFile = basename(file);
				this._emit();
			}
		});

		// Restore persisted settings (keys shared with the previous renderer)
		const ls = (k) => localStorage.getItem(k);
		const defaults = this.config.OUTPUT_FORMATS;

		const savedPreset = ls("anamorphicPreset");
		if (savedPreset) {
			this.factorPreset = savedPreset;
			this.customFactor = ls("customFactor") || "1.00";
		} else if (ls("ratioX")) {
			// Migrate from the old ratioX/ratioY pair
			const factor = parseFloat(ls("ratioX")) / (parseFloat(ls("ratioY")) || 1);
			const preset = FACTOR_PRESETS.find((p) => p.value !== "custom" && parseFloat(p.value) === factor);
			this.factorPreset = preset ? preset.value : "custom";
			if (!preset) this.customFactor = String(factor);
		} else {
			const factor = this.config.DEFAULT_RATIO_X / this.config.DEFAULT_RATIO_Y;
			this.factorPreset = String(factor);
		}

		this.format = ls("outputFormat") || this.config.DEFAULT_OUTPUT_FORMAT;
		this.formatOptions = {
			jpg: { quality: parseInt(ls("jpgQuality"), 10) || defaults.jpg.options.quality },
			tiff: { compression: ls("tiffCompression") || defaults.tiff.options.compression },
			webp: {
				quality: parseInt(ls("webpQuality"), 10) || defaults.webp.options.quality,
				lossless: ls("webpLossless") !== null ? ls("webpLossless") === "true" : defaults.webp.options.lossless,
			},
		};
		this._emit();
	}

	/** Effective anamorphic stretch factor */
	get factor() {
		return this.factorPreset === "custom" ? parseFloat(this.customFactor) : parseFloat(this.factorPreset);
	}

	setMode(mode) {
		if (!MODES.includes(mode) || mode === this.mode) return;
		this.mode = mode;
		this._emit();
	}

	setFactorPreset(value) {
		this.factorPreset = value;
		persist("anamorphicPreset", value);
		this._emit();
	}

	setCustomFactor(value) {
		this.customFactor = value;
		persist("customFactor", value);
		this._emit();
	}

	setFormat(value) {
		this.format = value;
		persist("outputFormat", value);
		this._emit();
	}

	setFormatOption(format, key, value) {
		this.formatOptions[format] = { ...this.formatOptions[format], [key]: value };
		const persistKeys = {
			"jpg.quality": "jpgQuality",
			"tiff.compression": "tiffCompression",
			"webp.quality": "webpQuality",
			"webp.lossless": "webpLossless",
		};
		const pk = persistKeys[`${format}.${key}`];
		if (pk) persist(pk, value);
		this._emit();
	}

	/** Output format + options payload for the desqueeze IPC call */
	getOutputOptions() {
		return { format: this.format, options: this.formatOptions[this.format] || {} };
	}

	/**
	 * Validate the current stretch factor.
	 * @returns {Promise<number|null>} the factor, or null if rejected
	 */
	async validateFactor() {
		const factor = this.factor;

		if (isNaN(factor) || factor <= 0) {
			await ipc.showErrorDialog("Invalid Input", "Please enter a valid positive anamorphic factor.");
			return null;
		}
		if (factor === 1) {
			const proceed = confirm(
				"The anamorphic factor is 1 - no stretch will be applied.\n\n" +
					"This is useful for testing the conversion without stretching.\n\n" +
					"Do you want to continue?"
			);
			if (!proceed) return null;
		}
		if (factor > this.config.MAX_STRETCH_FACTOR) {
			await ipc.showErrorDialog(
				"Stretch Factor Too High",
				`The stretch factor (${factor.toFixed(2)}) exceeds the maximum of ${this.config.MAX_STRETCH_FACTOR}.`
			);
			return null;
		}
		if (factor > this.config.STRETCH_WARN_THRESHOLD) {
			const proceed = confirm(
				`The stretch factor is quite high (${factor.toFixed(2)}).\n` +
					"Typical anamorphic lenses are 2x or less.\n\n" +
					"Do you want to continue?"
			);
			if (!proceed) return null;
		}
		return factor;
	}

	/**
	 * Queue dropped/browsed files and show the settings screen as a
	 * confirmation step. Dropping again while on settings replaces the queue.
	 * @param {string[]} filePaths absolute paths (already expanded)
	 */
	queueFiles(filePaths) {
		if (this.mode === "processing" || filePaths.length === 0) return;
		this.pendingFiles = filePaths;
		if (this.mode !== "settings") this.setMode("settings");
		else this._emit();
	}

	/** Leave settings without processing. The queue is left in place until the
	 * next drop/browse replaces it — clearing it here would shrink the actions
	 * row (Desqueeze button vanishes) and make the UI jump mid-fade-out. */
	cancelPending() {
		this.setMode("ready");
	}

	/** Process the queued files. Keeps the queue if validation bounced. */
	async processPending() {
		await this.handleFiles(this.pendingFiles);
		if (this.mode !== "settings") this.pendingFiles = [];
	}

	/**
	 * Full processing pipeline: validate → filter already-processed →
	 * process with live progress → land on success/error mode.
	 * @param {string[]} filePaths absolute paths (already expanded)
	 */
	async handleFiles(filePaths) {
		if (this.mode === "processing" || filePaths.length === 0) return;

		const factor = await this.validateFactor();
		if (factor === null) return;

		const { toProcess, skippedCount } = await ipc.filterDesqueezed(filePaths);

		if (toProcess.length === 0) {
			if (skippedCount > 0) {
				this.result = {
					successCount: 0,
					failedCount: 0,
					cancelledCount: 0,
					elapsed: 0,
					skippedCount,
					firstError: null,
					failures: [],
					factor,
					outputFiles: [],
				};
				this.setMode("success");
			}
			return;
		}

		this.progress = { done: 0, total: toProcess.length };
		this.result = null;
		this.currentFile = "";
		this.cancelRequested = false;
		this.setMode("processing");

		const startTime = performance.now();
		const outputOpts = this.getOutputOptions();

		const results = await Promise.all(
			toProcess.map((fp) =>
				ipc.desqueezeFile(fp, factor, 1, outputOpts).then((r) => {
					this.progress = { ...this.progress, done: this.progress.done + 1 };
					this._emit();
					return r;
				})
			)
		);

		const elapsedMs = performance.now() - startTime;
		if (elapsedMs < MIN_PROCESSING_MS) {
			await new Promise((r) => setTimeout(r, MIN_PROCESSING_MS - elapsedMs));
		}

		const elapsed = elapsedMs / 1000;
		const successCount = results.filter((r) => r.success).length;
		const cancelledCount = results.filter((r) => r.cancelled).length;
		const failures = results
			.filter((r) => !r.success && !r.cancelled)
			.map((r) => ({ file: r.originalFile, name: basename(r.originalFile || ""), error: r.error }));
		const firstError = failures[0]?.error || null;
		const outputFiles = results.filter((r) => r.success).map((r) => r.outputFile);

		this.result = {
			successCount,
			failedCount: failures.length,
			cancelledCount,
			elapsed,
			skippedCount,
			firstError,
			failures,
			factor,
			outputFiles,
		};
		this.currentFile = "";
		this.cancelRequested = false;
		this.setMode(failures.length > 0 ? "error" : "success");
	}

	/** Ask main to drop all queued (not yet started) jobs. In-flight jobs finish. */
	cancelProcessing() {
		if (this.mode !== "processing" || this.cancelRequested) return;
		this.cancelRequested = true;
		this._emit();
		ipc.cancelProcessing();
	}

	/** Reveal the first processed file in Finder */
	revealResult() {
		const file = this.result?.outputFiles?.[0];
		if (file) ipc.showInFolder(file);
	}

	_emit() {
		this.dispatchEvent(new Event("change"));
	}
}

export const store = new AppStore();

/**
 * Lit ReactiveController that re-renders its host whenever the store
 * changes. Usage: `store, new StoreController(this)` then read `store.*`
 * directly in render().
 */
export class StoreController {
	constructor(host) {
		this.host = host;
		this._onChange = () => host.requestUpdate();
		host.addController(this);
	}

	hostConnected() {
		store.addEventListener("change", this._onChange);
	}

	hostDisconnected() {
		store.removeEventListener("change", this._onChange);
	}
}
