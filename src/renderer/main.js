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

async function processFiles(filePaths, ratioX, ratioY, skippedCount = 0) {
	const startTime = performance.now();
	const results = await Promise.all(
		filePaths.map((fp) => window.api.desqueezeFile(fp, ratioX, ratioY))
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
	initToggle("theme-toggle", "theme", false, (isLight) => {
		document.documentElement.setAttribute(
			"data-theme",
			isLight ? "light" : "dark"
		);
	});
	initDropZone();
});
