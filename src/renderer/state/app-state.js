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

/**
 * Per-file states shown in the file list.
 * "skipped" is assigned at queue time — a file already carrying the output
 * suffix is listed and greyed rather than silently dropped from the count.
 */
export const FILE_STATES = ["queued", "running", "done", "failed", "cancelled", "skipped"];

const persist = (key, value) => localStorage.setItem(key, String(value));

/** Processing screen shows at least this long. Display-only: the elapsed
 * time reported on the success screen is the real processing time. Just
 * enough to let the crossfade finish instead of flashing for tiny batches. */
const MIN_PROCESSING_MS = 400;

/** Extract a display name from an absolute path (either separator style) */
const basename = (p) => String(p).split(/[\\/]/).pop();

/** Uppercase extension without the dot, for the row badge ("ARW", "JPG") */
const extOf = (p) => {
	const b = basename(p);
	const i = b.lastIndexOf(".");
	return i > 0 ? b.slice(i + 1).toUpperCase() : "";
};

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

	/**
	 * The batch, in the order it was queued. This is the file list's model and
	 * survives from queue through processing into the result screen, so a row
	 * that failed can name itself instead of being folded into a count.
	 * @type {{path:string, name:string, ext:string, status:string,
	 *         error:string|null, outputFile:string|null}[]}
	 */
	files = [];

	result = null; // { successCount, failedCount, cancelledCount, elapsed, skippedCount, firstError, failures }
	cancelRequested = false;
	settingsOpen = false;

	async init() {
		this.config = await ipc.getConfig();

		// Live progress pushed from the main process (which file just started)
		ipc.onProcessingProgress(({ state, file }) => {
			if (state === "started") {
				// Only a queued row may start; see _setStatus for why.
				this._setStatus(file, "running", "queued");
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

	// ── Derived views over `files` ──

	/** Files that would actually be converted (everything not already desqueezed) */
	get actionable() {
		return this.files.filter((f) => f.status !== "skipped");
	}

	get progress() {
		const total = this.actionable.length;
		const done = this.files.filter((f) => f.status === "done" || f.status === "failed").length;
		return { done, total };
	}

	get failedFiles() {
		return this.files.filter((f) => f.status === "failed");
	}

	/** Label of the current output format ("DNG", "JPEG", …) */
	get formatLabel() {
		return this.config?.OUTPUT_FORMATS?.[this.format]?.label || this.format.toUpperCase();
	}

	/** Effective anamorphic stretch factor */
	get factor() {
		return this.factorPreset === "custom" ? parseFloat(this.customFactor) : parseFloat(this.factorPreset);
	}

	/** Factor rendered for the settings chip — "1.33x", not "1.3300000000000001x" */
	get factorLabel() {
		const f = this.factor;
		return Number.isFinite(f) ? `${parseFloat(f.toFixed(2))}x` : "-";
	}

	setMode(mode) {
		if (!MODES.includes(mode) || mode === this.mode) return;
		this.mode = mode;
		// The settings chip stows in these modes; a popover left open would
		// outlive the control that owns it.
		if (["processing", "success", "error"].includes(mode)) this.settingsOpen = false;
		this._emit();
	}

	toggleSettings(open) {
		this.settingsOpen = open === undefined ? !this.settingsOpen : open;
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

	// ── Queue ──

	/**
	 * Queue dropped/browsed files and show the list as a confirmation step.
	 * Dropping again while queued replaces the batch.
	 *
	 * The already-desqueezed check runs here rather than only at process time,
	 * so those files are visible in the list — greyed and labelled — before the
	 * user commits, instead of quietly vanishing from the count afterwards.
	 * @param {string[]} filePaths absolute paths (already expanded)
	 */
	async queueFiles(filePaths) {
		if (this.mode === "processing" || filePaths.length === 0) return;

		let skipped = new Set();
		try {
			const res = await ipc.filterDesqueezed(filePaths);
			skipped = new Set(res.skipped || []);
		} catch {
			// A failed pre-check must not block the batch — handleFiles filters again.
		}

		this.files = filePaths.map((p) => ({
			path: p,
			name: basename(p),
			ext: extOf(p),
			status: skipped.has(p) ? "skipped" : "queued",
			error: null,
			outputFile: null,
		}));
		this.result = null;
		this.cancelRequested = false;

		if (this.mode !== "settings") this.setMode("settings");
		else this._emit();
	}

	/**
	 * Drop a single file from the batch before it runs.
	 *
	 * Only meaningful during the confirm step: once a run has started a row
	 * is a record of what happened, not a queue entry. Removing the last one
	 * is the same as clearing the batch, so it lands back on the empty state.
	 * @param {string} path
	 */
	removeFile(path) {
		if (this.mode !== "settings") return;
		this.files = this.files.filter((f) => f.path !== path);
		if (this.files.length === 0) this.setMode("ready");
		else this._emit();
	}

	/** Drop the batch entirely and return to the empty state. */
	clearFiles() {
		if (this.mode === "processing") return;
		// The batch is deliberately NOT emptied here. Returning to ready starts
		// a crossfade, and the list has to keep rendering its rows until that
		// fade finishes — emptying the array now made the rows vanish on the
		// first frame while the panel around them was still fading. Nothing
		// reads files or result in ready mode, and queueFiles() replaces both
		// outright, so they are left to be overwritten by the next batch.
		this.settingsOpen = false;
		if (this.mode !== "ready") this.setMode("ready");
		else this._emit();
	}

	/** Leave the list without processing, keeping the batch queued. */
	cancelPending() {
		this.settingsOpen = false;
		this.setMode("ready");
	}

	/** Process everything currently queued. */
	async processPending() {
		await this.handleFiles(this.actionable.map((f) => f.path));
	}

	/** Re-run only the files that failed, leaving the successes in place. */
	async retryFailed() {
		const paths = this.failedFiles.map((f) => f.path);
		if (paths.length === 0) return;
		for (const f of this.files) {
			if (f.status === "failed") {
				f.status = "queued";
				f.error = null;
			}
		}
		await this.handleFiles(paths);
	}

	/**
	 * Full processing pipeline: validate → filter already-processed →
	 * process with live per-file status → land on success/error mode.
	 * @param {string[]} filePaths absolute paths (already expanded)
	 */
	async handleFiles(filePaths) {
		if (this.mode === "processing" || filePaths.length === 0) return;

		const factor = await this.validateFactor();
		if (factor === null) return;

		const { toProcess, skipped = [], skippedCount } = await ipc.filterDesqueezed(filePaths);
		for (const p of skipped) this._setStatus(p, "skipped");

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

		for (const p of toProcess) this._setStatus(p, "queued");
		this.cancelRequested = false;
		this.setMode("processing");

		const startTime = performance.now();
		const outputOpts = this.getOutputOptions();

		const results = await Promise.all(
			toProcess.map((fp) =>
				ipc.desqueezeFile(fp, factor, 1, outputOpts).then((r) => {
					// Each result lands here individually — that is what lets a row
					// flip to done or failed the moment its own conversion returns.
					const entry = this.files.find((f) => f.path === fp);
					if (entry) {
						entry.status = r.success ? "done" : r.cancelled ? "cancelled" : "failed";
						entry.error = r.success ? null : r.error || null;
						entry.outputFile = r.outputFile || null;
					}
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
			skippedCount: this.files.filter((f) => f.status === "skipped").length,
			firstError,
			failures,
			factor,
			outputFiles,
		};
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
		const file = this.files.find((f) => f.outputFile)?.outputFile;
		if (file) ipc.showInFolder(file);
	}

	/** Reveal one specific row's output in Finder */
	revealFile(path) {
		const entry = this.files.find((f) => f.path === path);
		if (entry?.outputFile) ipc.showInFolder(entry.outputFile);
	}

	/** Copy every failure as "name: error" lines, for pasting into a bug report */
	/**
	 * Write a support log for this batch.
	 *
	 * This replaced a clipboard copy of one line per failure. That was enough
	 * to see that something broke and never enough to work out why: the reply
	 * was always a round trip asking for the version, the platform, the
	 * format, the factor and what the tool actually printed. The main process
	 * gathers all of that (see services/diagnostics.js) around the snapshot
	 * sent from here, and hands back a file the user can attach to an email.
	 */
	async saveErrorLog() {
		return ipc.saveErrorLog({
			factor: this.factor,
			factorLabel: this.factorLabel,
			format: this.format,
			formatOptions: this.formatOptions,
			result: this.result,
			files: this.files.map((f) => ({
				name: f.name,
				path: f.path,
				ext: f.ext,
				status: f.status,
				error: f.error,
				outputFile: f.outputFile,
			})),
		});
	}

	/**
	 * Set a row's status.
	 *
	 * @param {string} path
	 * @param {string} status
	 * @param {string|null} only guard: apply only if the row is currently in
	 *   this status. The "started" push from the main process and the result
	 *   of the conversion itself arrive over two independent channels, so a
	 *   file that fails immediately — a truncated JPG, say — can resolve
	 *   before its own "started" ever lands. Without the guard that late push
	 *   drags the row from failed back to running, where it sticks: the list
	 *   reads "Converting" forever and the file drops out of the failed count
	 *   while the batch still lands in error mode.
	 */
	_setStatus(path, status, only = null) {
		const entry = this.files.find((f) => f.path === path);
		if (!entry) return;
		if (only !== null && entry.status !== only) return;
		entry.status = status;
	}

	/**
	 * Notify subscribers, at most once per frame.
	 *
	 * With MAX_CONCURRENCY files in flight and a folder of several hundred
	 * queued, results land in bursts; emitting synchronously per result made
	 * the list re-render once per file. Coalescing bounds that to one render
	 * per frame no matter how large the batch is.
	 *
	 * The timer is not redundant with the frame callback: a minimised or
	 * fully occluded window stops firing requestAnimationFrame, and on rAF
	 * alone every state change would stall until the window came back.
	 * Whichever fires first flushes; the other is a no-op.
	 */
	_emit() {
		if (this._emitQueued) return;
		this._emitQueued = true;

		const flush = () => {
			if (!this._emitQueued) return;
			this._emitQueued = false;
			clearTimeout(this._emitTimer);
			this.dispatchEvent(new Event("change"));
		};

		this._emitTimer = setTimeout(flush, 32);
		if (typeof requestAnimationFrame === "function") requestAnimationFrame(flush);
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
