// Select and process images for desqueezing

async function selectAndReadMetadata() {
	try {
		// Get ratio values from inputs
		const ratioXInput = document.getElementById("ratio-x");
		const ratioYInput = document.getElementById("ratio-y");
		const ratioX = parseFloat(ratioXInput.value);
		const ratioY = parseFloat(ratioYInput.value);

		// Validate ratios
		if (isNaN(ratioX) || isNaN(ratioY) || ratioX <= 0 || ratioY <= 0) {
			await window.api.showErrorDialog(
				"Invalid Input",
				"Please enter valid positive numbers for both ratios."
			);
			return;
		}

		// Check if ratios are the same
		if (ratioX === ratioY) {
			await window.api.showErrorDialog(
				"Invalid Ratios",
				"Ratio X and Ratio Y cannot be the same value. This would not change the photo's width."
			);
			return;
		}

		// Check stretch factor limit
		const stretchFactor = ratioX / ratioY;
		if (stretchFactor > 2.5) {
			await window.api.showErrorDialog(
				"Stretch Factor Too High",
				`The stretch factor (${stretchFactor.toFixed(
					2
				)}) exceeds the maximum allowed value of 2.5.`
			);
			return;
		}

		// Open file dialog
		const selection = await window.api.selectImageFile();

		if (!selection) {
			console.log("No file selected");
			return;
		}

		// Normalize to array for consistent handling
		const filePaths = Array.isArray(selection) ? selection : [selection];

		console.log("Selected files:", filePaths);
		console.log("Using ratios:", { ratioX, ratioY });

		// Process all files with timing
		const startTime = performance.now();
		const results = [];
		for (const filePath of filePaths) {
			const result = await window.api.desqueezeFile(
				filePath,
				ratioX,
				ratioY
			);
			results.push(result);
		}
		const endTime = performance.now();
		const elapsedTime = (endTime - startTime) / 1000; // Convert to seconds

		// Check results
		const successful = results.filter((r) => r.success);
		const failed = results.filter((r) => !r.success);

		if (successful.length > 0) {
			console.log(
				"Processed files:",
				successful.map((r) => r.outputFile)
			);
			displayResults(successful.length, failed.length, elapsedTime);
		} else if (failed.length > 0) {
			console.error(
				"All files failed:",
				failed.map((r) => r.error)
			);
			alert(`Error: ${failed[0].error}`);
		}
	} catch (error) {
		console.error("Error:", error);
		alert(`Error: ${error.message}`);
	}
}

function displayResults(successCount, failedCount, elapsedTime) {
	const container = document.getElementById("metadata-display");

	if (!container) {
		console.log("No display container found");
		console.log("Success:", successCount, "Failed:", failedCount);
		return;
	}

	// Format elapsed time
	let timeStr;
	if (elapsedTime < 1) {
		timeStr = `${(elapsedTime * 1000).toFixed(0)}ms`;
	} else if (elapsedTime < 60) {
		timeStr = `${elapsedTime.toFixed(2)}s`;
	} else {
		const minutes = Math.floor(elapsedTime / 60);
		const seconds = (elapsedTime % 60).toFixed(0);
		timeStr = `${minutes}m ${seconds}s`;
	}

	// Build results HTML with daisyUI components
	const fileWord = successCount === 1 ? "file" : "files";
	let resultsHtml = `
		<div class="alert alert-success">
			<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
			<div>
				<h3 class="font-bold">Success!</h3>
				<div class="text-sm"><span class="font-semibold">${successCount}</span> ${fileWord} generated in <span class="font-semibold">${timeStr}</span></div>
			</div>
		</div>
	`;

	if (failedCount > 0) {
		const failedWord = failedCount === 1 ? "file" : "files";
		resultsHtml += `
			<div class="alert alert-error mt-3">
				<svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
				<span><span class="font-semibold">${failedCount}</span> ${failedWord} failed to process</span>
			</div>
		`;
	}

	container.innerHTML = resultsHtml;
}

// Attach event listener when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	const button = document.getElementById("select-btn");
	if (button) {
		button.addEventListener("click", selectAndReadMetadata);
	}
});
