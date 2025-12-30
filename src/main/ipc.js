import { ipcMain, dialog } from "electron";
import { RAW_FORMATS, BITMAP_FORMATS, PREMIUM } from "./config.js";
import { desqueeze } from "./processors/desqueeze.js";
import path from "path";
import fs from "fs/promises";

// All supported formats (created once)
const ALL_FORMATS = new Set([...RAW_FORMATS, ...BITMAP_FORMATS]);
const EXTENSIONS = Array.from(ALL_FORMATS).map((ext) => ext.replace(".", ""));

// Get all supported files from a directory recursively
async function getFilesFromDirectory(dirPath, extensions) {
	const files = [];
	const entries = await fs.readdir(dirPath, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = path.join(dirPath, entry.name);
		if (entry.isDirectory()) {
			const subFiles = await getFilesFromDirectory(fullPath, extensions);
			files.push(...subFiles);
		} else if (entry.isFile()) {
			const ext = path.extname(entry.name).toLowerCase();
			if (extensions.has(ext)) {
				files.push(fullPath);
			}
		}
	}

	return files;
}

// Register all IPC handlers
export function registerIpcHandlers(win) {
	// File selection dialog
	ipcMain.handle("select-image-file", async () => {
		const properties = PREMIUM
			? ["openFile", "openDirectory", "multiSelections"]
			: ["openFile"];

		const result = await dialog.showOpenDialog(win, {
			properties,
			filters: [
				{ name: "Supported Images", extensions: EXTENSIONS },
				{ name: "All Files", extensions: ["*"] },
			],
		});

		if (result.canceled || result.filePaths.length === 0) {
			return null;
		}

		if (PREMIUM) {
			// Expand directories to get all supported files
			const allFiles = [];
			for (const selectedPath of result.filePaths) {
				const stat = await fs.stat(selectedPath);
				if (stat.isDirectory()) {
					const dirFiles = await getFilesFromDirectory(
						selectedPath,
						ALL_FORMATS
					);
					allFiles.push(...dirFiles);
				} else {
					allFiles.push(selectedPath);
				}
			}
			return allFiles.length > 0 ? allFiles : null;
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
			title,
			message,
			buttons: ["OK"],
		});
	});

	// Expand dropped paths (handles both files and folders)
	ipcMain.handle("expand-dropped-paths", async (event, paths) => {
		const allFiles = [];
		for (const droppedPath of paths) {
			try {
				const stat = await fs.stat(droppedPath);
				if (stat.isDirectory()) {
					allFiles.push(
						...(await getFilesFromDirectory(
							droppedPath,
							ALL_FORMATS
						))
					);
				} else if (
					stat.isFile() &&
					ALL_FORMATS.has(path.extname(droppedPath).toLowerCase())
				) {
					allFiles.push(droppedPath);
				}
			} catch (err) {
				console.error(`Error processing path ${droppedPath}:`, err);
			}
		}
		return allFiles;
	});

	// Filter out already-desqueezed files
	ipcMain.handle("filter-desqueezed", (event, filePaths) => {
		const toProcess = [];
		const skipped = [];
		for (const fp of filePaths) {
			const name = path.basename(fp).toLowerCase();
			if (name.includes("-desqueezed")) {
				skipped.push(fp);
			} else {
				toProcess.push(fp);
			}
		}
		return { toProcess, skippedCount: skipped.length };
	});
}
