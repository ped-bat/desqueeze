// Desqueeze app - Renderer process

// === Configuration (mirrors AppConfig values) ===
const CONFIG = {
	MAX_STRETCH_FACTOR: 5.0,
	STRETCH_WARN_THRESHOLD: 3.0,
	MAX_CONCURRENCY: 3,
	DEFAULT_RATIO_X: "1.33",
	DEFAULT_RATIO_Y: "1",
	DEFAULT_OUTPUT_FORMAT: "dng",
};

// === Utils ===
function pLimit(concurrency) {
	const queue = [];
	let activeCount = 0;

	const next = () => {
		activeCount--;
		if (queue.length > 0) {
			queue.shift()();
		}
	};

	const run = async (fn, resolve, reject) => {
		activeCount++;
		const result = (async () => fn())();
		try {
			const value = await result;
			resolve(value);
		} catch (err) {
			reject(err);
		}
		next();
	};

	const enqueue = (fn, resolve, reject) => {
		queue.push(run.bind(null, fn, resolve, reject));
		if (activeCount < concurrency && queue.length > 0) {
			queue.shift()();
		}
	};

	const generator = (fn, ...args) =>
		new Promise((resolve, reject) => {
			enqueue(() => fn(...args), resolve, reject);
		});

	return generator;
}

// === Preferences ===

function initRatioInput(id, storageKey, defaultValue) {
	const input = document.getElementById(id);
	if (!input) return;

	const saved = localStorage.getItem(storageKey);
	if (saved !== null) {
		input.value = saved;
	} else {
		input.value = defaultValue;
	}

	input.addEventListener("change", () => {
		localStorage.setItem(storageKey, input.value);
	});
}

function initToggle(id, storageKey, defaultValue, onChange) {
	const toggle = document.getElementById(id);
	if (!toggle) return;

	const saved = localStorage.getItem(storageKey);
	toggle.checked = saved !== null ? saved === "true" : defaultValue;
	onChange?.(toggle.checked);

	toggle.addEventListener("change", () => {
		localStorage.setItem(storageKey, toggle.checked);
		onChange?.(toggle.checked);
	});
}

// === Output Format ===

/**
 * Show/hide the format-specific option panels based on the selected format.
 * @param {string} format - The selected format key
 */
function showFormatOptions(format) {
	document.querySelectorAll(".format-opts").forEach((el) => el.classList.add("hidden"));
	const panel = document.getElementById(`opts-${format}`);
	if (panel) panel.classList.remove("hidden");

	// Show/hide the hint about pixel resampling for non-DNG formats
	const hint = document.getElementById("format-hint");
	if (hint) hint.classList.toggle("hidden", format === "dng");
}

/**
 * Wire a range slider to update its label text.
 * @param {string} sliderId
 * @param {string} labelId
 */
function linkSliderLabel(sliderId, labelId) {
	const slider = document.getElementById(sliderId);
	const label = document.getElementById(labelId);
	if (!slider || !label) return;
	slider.addEventListener("input", () => {
		label.textContent = slider.value;
	});
}

/**
 * Initialise the output-format dropdown and format-specific controls.
 * Restores persisted choices from localStorage.
 */
function initOutputFormat() {
	const select = document.getElementById("output-format");
	if (!select) return;

	// Restore saved format
	const savedFormat = localStorage.getItem("outputFormat") || CONFIG.DEFAULT_OUTPUT_FORMAT;
	select.value = savedFormat;
	showFormatOptions(savedFormat);

	select.addEventListener("change", () => {
		localStorage.setItem("outputFormat", select.value);
		showFormatOptions(select.value);
	});

	// Wire slider labels
	linkSliderLabel("jpg-quality", "jpg-quality-val");
	linkSliderLabel("png-compression", "png-compression-val");
	linkSliderLabel("webp-quality", "webp-quality-val");

	// Restore saved per-format values
	restoreFormatControl("jpg-quality", "jpgQuality", "95");
	restoreFormatControl("png-compression", "pngCompression", "2");
	restoreFormatControl("tiff-compression", "tiffCompression", "lzw");
	restoreFormatControl("webp-quality", "webpQuality", "90");
	restoreFormatToggle("webp-lossless", "webpLossless", false);
}

function restoreFormatControl(elementId, storageKey, defaultValue) {
	const el = document.getElementById(elementId);
	if (!el) return;
	const saved = localStorage.getItem(storageKey);
	el.value = saved ?? defaultValue;

	// Update label if slider
	const labelEl = document.getElementById(`${elementId}-val`);
	if (labelEl) labelEl.textContent = el.value;

	el.addEventListener("change", () => localStorage.setItem(storageKey, el.value));
}

function restoreFormatToggle(elementId, storageKey, defaultValue) {
	const el = document.getElementById(elementId);
	if (!el) return;
	const saved = localStorage.getItem(storageKey);
	el.checked = saved !== null ? saved === "true" : defaultValue;
	el.addEventListener("change", () => localStorage.setItem(storageKey, String(el.checked)));
}

/**
 * Collect the current output format + options from the UI.
 * @returns {{ format: string, options: object }}
 */
function getOutputOptions() {
	const format = document.getElementById("output-format")?.value || "dng";

	switch (format) {
		case "jpg":
			return {
				format,
				options: { quality: parseInt(document.getElementById("jpg-quality")?.value || "95", 10) },
			};
		case "png":
			return {
				format,
				options: { compressionLevel: parseInt(document.getElementById("png-compression")?.value || "2", 10) },
			};
		case "tiff":
			return {
				format,
				options: { compression: document.getElementById("tiff-compression")?.value || "lzw" },
			};
		case "webp":
			return {
				format,
				options: {
					quality: parseInt(document.getElementById("webp-quality")?.value || "90", 10),
					lossless: document.getElementById("webp-lossless")?.checked || false,
				},
			};
		default:
			return { format: "dng", options: {} };
	}
}

// === Validation ===

async function getValidatedRatios() {
	const ratioX = parseFloat(document.getElementById("ratio-x").value);
	const ratioY = parseFloat(document.getElementById("ratio-y").value);

	if (isNaN(ratioX) || isNaN(ratioY) || ratioX <= 0 || ratioY <= 0) {
		await window.api.showErrorDialog(
			"Invalid Input",
			"Please enter valid positive numbers for both ratios."
		);
		return null;
	}

	if (ratioX === ratioY) {
		// Allow same ratio for testing (no stretch applied)
		const proceed = confirm(
			"Ratio X and Ratio Y are the same - no stretch will be applied.\n\n" +
			"This is useful for testing the DNG conversion without stretching.\n\n" +
			"Do you want to continue?"
		);
		if (!proceed) {
			return null;
		}
	}

	if (ratioX / ratioY > CONFIG.MAX_STRETCH_FACTOR) {
		await window.api.showErrorDialog(
			"Stretch Factor Too High",
			`The stretch factor (${(ratioX / ratioY).toFixed(
				2
			)}) exceeds the maximum of ${CONFIG.MAX_STRETCH_FACTOR}.`
		);
		return null;
	}

	if (ratioX / ratioY > CONFIG.STRETCH_WARN_THRESHOLD) {
		const proceed = confirm(
			`The stretch factor is quite high (${(ratioX / ratioY).toFixed(2)}).\n` +
			"Typical anamorphic lenses are 2x or less.\n\n" +
			"Do you want to continue?"
		);
		if (!proceed) return null;
	}

	return { ratioX, ratioY };
}

// === File Processing ===

async function processFiles(filePaths, ratioX, ratioY, skippedCount = 0) {
	const startTime = performance.now();
	const outputOpts = getOutputOptions();
	
	const results = await Promise.all(
		filePaths.map((fp) => 
			window.api.desqueezeFile(fp, ratioX, ratioY, outputOpts)
		)
	);
	
	const elapsed = (performance.now() - startTime) / 1000;

	const successCount = results.filter((r) => r.success).length;
	const failedCount = results.length - successCount;

	if (successCount > 0 || skippedCount > 0) {
		displayResults(successCount, failedCount, elapsed, skippedCount);
		if (successCount > 0) playSound();
	} else if (failedCount > 0) {
		alert(`Error: ${results.find((r) => !r.success).error}`);
	}
}

async function handleFiles(filePaths) {
	const ratios = await getValidatedRatios();
	if (!ratios || filePaths.length === 0) return;

	// Filter out already-desqueezed files
	const { toProcess, skippedCount } = await window.api.filterDesqueezed(
		filePaths
	);

	if (toProcess.length === 0 && skippedCount > 0) {
		displayResults(0, 0, 0, skippedCount);
		return;
	}
	if (toProcess.length === 0) return;

	await processFiles(toProcess, ratios.ratioX, ratios.ratioY, skippedCount);
}

// === UI ===

function playSound() {
	if (!document.getElementById("sound-toggle")?.checked) return;
	new Audio("./assets/audio/complete.wav").play().catch(() => {});
}

function formatTime(seconds) {
	if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
	if (seconds < 60) return `${seconds.toFixed(2)}s`;
	return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
}

function displayMessage(message, type = "warning") {
	const container = document.getElementById("metadata-display");
	if (!container) return;
	container.innerHTML = `<div class="alert alert-${type} transition-opacity duration-500"><span>${message}</span></div>`;
	scheduleFadeOut(container);
}

function scheduleFadeOut(container, delay = 4000) {
	setTimeout(() => {
		const alerts = container.querySelectorAll(".alert");
		alerts.forEach((alert) => alert.classList.add("opacity-0"));
		setTimeout(() => (container.innerHTML = ""), 500);
	}, delay);
}

function displayResults(successCount, failedCount, elapsed, skippedCount = 0) {
	const container = document.getElementById("metadata-display");
	if (!container) return;

	const plural = (n) => (n === 1 ? "file" : "files");
	const skippedText =
		skippedCount > 0
			? `, ${skippedCount} ${plural(skippedCount)} already desqueezed`
			: "";

	const hasSuccess = successCount > 0;
	const mainMessage = hasSuccess
		? `✓ <strong>${successCount}</strong> ${plural(
				successCount
		  )} generated in <strong>${formatTime(elapsed)}</strong>${skippedText}`
		: `${skippedCount} ${plural(skippedCount)} already desqueezed`;

	container.innerHTML = `
		<div class="alert ${
			hasSuccess ? "alert-success" : "alert-warning"
		} transition-opacity duration-500">
			<span>${mainMessage}</span>
		</div>
		${
			failedCount > 0
				? `<div class="alert alert-error mt-3 transition-opacity duration-500"><span>✗ <strong>${failedCount}</strong> ${plural(
						failedCount
				  )} failed</span></div>`
				: ""
		}
	`;
	scheduleFadeOut(container);
}

// === Drop Zone ===

function initDropZone() {
	const dropZone = document.getElementById("drop-zone");
	if (!dropZone) return;

	// Click to open file dialog
	dropZone.addEventListener("click", async () => {
		const selection = await window.api.selectImageFile();
		if (
			!selection ||
			(Array.isArray(selection) && selection.length === 0)
		) {
			displayMessage("No files were selected");
			return;
		}
		await handleFiles(Array.isArray(selection) ? selection : [selection]);
	});

	// Drag and drop
	["dragenter", "dragover", "dragleave", "drop"].forEach((e) =>
		dropZone.addEventListener(e, (ev) => {
			ev.preventDefault();
			ev.stopPropagation();
		})
	);

	["dragenter", "dragover"].forEach((e) =>
		dropZone.addEventListener(e, () =>
			dropZone.classList.add("border-primary", "bg-base-200")
		)
	);

	["dragleave", "drop"].forEach((e) =>
		dropZone.addEventListener(e, () =>
			dropZone.classList.remove("border-primary", "bg-base-200")
		)
	);

	dropZone.addEventListener("drop", async (e) => {
		const paths = Array.from(e.dataTransfer.files)
			.map((f) => window.api.getPathForFile(f))
			.filter(Boolean);

		if (paths.length === 0) {
			displayMessage("No files were selected");
			return;
		}

		const expanded = await window.api.expandDroppedPaths(paths);
		if (expanded.length === 0) {
			displayMessage("No supported image files were found");
			return;
		}
		await handleFiles(expanded);
	});
}

// === Init ===

document.addEventListener("DOMContentLoaded", () => {
	initToggle("sound-toggle", "soundEnabled", true);
	initRatioInput("ratio-x", "ratioX", CONFIG.DEFAULT_RATIO_X);
	initRatioInput("ratio-y", "ratioY", CONFIG.DEFAULT_RATIO_Y);
	initOutputFormat();
	initDropZone();
});
