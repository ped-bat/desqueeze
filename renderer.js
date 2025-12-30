// Example: Select and read metadata from an image file

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
		const filePath = await window.api.selectImageFile();

		if (!filePath) {
			console.log("No file selected");
			return;
		}

		console.log("Selected file:", filePath);
		console.log("Using ratios:", { ratioX, ratioY });

		// Desqueeze the file
		const result = await window.api.desqueezeFile(filePath, ratioX, ratioY);

		if (result.success) {
			console.log("Output file:", result.outputFile);

			// Extract filename from output path
			const parts = result.outputFile.split(/[\\/]/);
			const filename = parts[parts.length - 1];

			displayResults(filename, result.outputFile);
		} else {
			console.error("Error:", result.error);
			alert(`Error: ${result.error}`);
		}
	} catch (error) {
		console.error("Error:", error);
		alert(`Error: ${error.message}`);
	}
}

function displayResults(filename, outputPath) {
	const container = document.getElementById("metadata-display");

	if (!container) {
		console.log("No display container found");
		console.log("Filename:", filename);
		console.log("Output:", outputPath);
		return;
	}

	// Clear previous content and display results
	container.innerHTML = `
		<h2>Success!</h2>
		<div class="results-box">
			<div class="result-item">
				<strong>Output File:</strong> ${escapeHtml(filename)}
			</div>
			<div class="result-item">
				<strong>Path:</strong> ${escapeHtml(outputPath)}
			</div>
		</div>
	`;
}

function escapeHtml(text) {
	const div = document.createElement("div");
	div.textContent = text;
	return div.innerHTML;
}

// Attach event listener when DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
	const button = document.getElementById("select-btn");
	if (button) {
		button.addEventListener("click", selectAndReadMetadata);
	}
});
