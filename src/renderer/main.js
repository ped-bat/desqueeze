// Desqueeze app - Renderer process

// === Preferences ===

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
		await window.api.showErrorDialog(
			"Invalid Ratios",
			"Ratio X and Ratio Y cannot be the same value."
		);
		return null;
	}

	if (ratioX / ratioY > 2.5) {
		await window.api.showErrorDialog(
			"Stretch Factor Too High",
			`The stretch factor (${(ratioX / ratioY).toFixed(
				2
			)}) exceeds the maximum of 2.5.`
		);
		return null;
	}

	return { ratioX, ratioY };
}

// === File Processing ===

async function processFiles(filePaths, ratioX, ratioY) {
	const startTime = performance.now();
	const results = await Promise.all(
		filePaths.map((fp) => window.api.desqueezeFile(fp, ratioX, ratioY))
	);
	const elapsed = (performance.now() - startTime) / 1000;

	const successCount = results.filter((r) => r.success).length;
	const failedCount = results.length - successCount;

	if (successCount > 0) {
		displayResults(successCount, failedCount, elapsed);
		playSound();
	} else if (failedCount > 0) {
		alert(`Error: ${results.find((r) => !r.success).error}`);
	}
}

async function handleFiles(filePaths) {
	const ratios = await getValidatedRatios();
	if (!ratios || filePaths.length === 0) return;
	await processFiles(filePaths, ratios.ratioX, ratios.ratioY);
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

function displayResults(successCount, failedCount, elapsed) {
	const container = document.getElementById("metadata-display");
	if (!container) return;

	const plural = (n) => (n === 1 ? "file" : "files");
	container.innerHTML = `
		<div class="alert alert-success">
			<span>✓ <strong>${successCount}</strong> ${plural(
		successCount
	)} generated in <strong>${formatTime(elapsed)}</strong></span>
		</div>
		${
			failedCount > 0
				? `<div class="alert alert-error mt-3"><span>✗ <strong>${failedCount}</strong> ${plural(
						failedCount
				  )} failed</span></div>`
				: ""
		}
	`;
}

// === Drop Zone ===

function initDropZone() {
	const dropZone = document.getElementById("drop-zone");
	if (!dropZone) return;

	// Click to open file dialog
	dropZone.addEventListener("click", async () => {
		const selection = await window.api.selectImageFile();
		if (selection) {
			await handleFiles(
				Array.isArray(selection) ? selection : [selection]
			);
		}
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

		if (paths.length === 0) return;

		const expanded = await window.api.expandDroppedPaths(paths);
		if (expanded.length === 0) {
			await window.api.showErrorDialog(
				"No Supported Files",
				"No supported image files were found."
			);
			return;
		}
		await handleFiles(expanded);
	});
}

// === Init ===

document.addEventListener("DOMContentLoaded", () => {
	initToggle("sound-toggle", "soundEnabled", true);
	initToggle("theme-toggle", "theme", false, (isLight) => {
		document.documentElement.setAttribute(
			"data-theme",
			isLight ? "light" : "dark"
		);
	});
	initDropZone();
});
