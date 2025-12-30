const { ipcMain, dialog } = require("electron");
const { RAW_FORMATS, BITMAP_FORMATS } = require("./config");
const { desqueeze } = require("./processors/desqueeze");

// Register all IPC handlers
function registerIpcHandlers(win) {
	// File selection dialog
	ipcMain.handle("select-image-file", async () => {
		const allFormats = new Set([...RAW_FORMATS, ...BITMAP_FORMATS]);
		const extensions = Array.from(allFormats).map((ext) =>
			ext.replace(".", "")
		);

		const result = await dialog.showOpenDialog(win, {
			properties: ["openFile"],
			filters: [
				{ name: "Supported Images", extensions },
				{ name: "All Files", extensions: ["*"] },
			],
		});

		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}

		return result.filePaths[0];
	});

	// Main desqueeze handler
	ipcMain.handle(
		"desqueeze-file",
		async (event, filePath, ratioX, ratioY) => {
			try {
				const outputPath = await desqueeze(filePath, ratioX, ratioY);
				return {
					success: true,
					originalFile: filePath,
					outputFile: outputPath,
				};
			} catch (error) {
				return {
					success: false,
					error: error.message,
				};
			}
		}
	);

	// Error dialog handler
	ipcMain.handle("show-error-dialog", async (event, title, message) => {
		await dialog.showMessageBox(win, {
			type: "error",
			title: title,
			message: message,
			buttons: ["OK"],
		});
	});
}

module.exports = { registerIpcHandlers };
