// Example: Select and read metadata from an image file

async function selectAndReadMetadata() {
	try {
		// Open file dialog
		const filePath = await window.api.selectImageFile();

		if (!filePath) {
			console.log("No file selected");
			return;
		}

		console.log("Selected file:", filePath);

		// Desqueeze the file
		const result = await window.api.desqueezeFile(filePath);

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
