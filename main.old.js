// Node module dependencies
const { app, BrowserWindow, ipcMain, dialog } = require("electron");
const path = require("path");
const { exiftool } = require("exiftool-vendored");
const sharp = require("sharp");
const { promisify } = require("util");
const { exec } = require("child_process");
const fs = require("fs").promises;

const execAsync = promisify(exec);

// Supported RAW formats
const RAW_FORMATS = new Set([
	".3fr",
	".ari",
	".arw",
	".cr2",
	".cr3",
	".crw",
	".dcr",
	".dcs",
	".dng",
	".erf",
	".iiq",
	".iiq",
	".kdc",
	".mef",
	".mos",
	".mrw",
	".nef",
	".nrw",
	".orf",
	".pef",
	".raf",
	".raw",
	".rw2",
	".sr2",
	".srf",
	".srw",
]);

// Supported Bitmap formats for Sharp stretch conversion
const BITMAP_FORMATS = new Set([
	".jpg",
	".jpeg",
	".png",
	".tif",
	".tiff",
	".webp",
]);

// Aspect ratio values for desqueezing
const ratioX = 1.33;
const ratioY = 1;

// Function to get the bundled DNGLab binary path
function getDNGLabPath() {
	const platform = process.platform;
	const binaryName = platform === "win32" ? "dnglab.exe" : "dnglab";
	const basePath = app.isPackaged ? process.resourcesPath : __dirname;
	return path.join(
		basePath,
		app.isPackaged ? "bin" : "resources/bin",
		platform,
		binaryName
	);
}

// Keep a global reference of the window object
let win;

// Custom fuction to create main application window
function createWindow() {
	// Creates the browser window
	win = new BrowserWindow({
		frame: true,
		width: 800,
		height: 600,
		backgroundColor: "#000000",
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	win.once("ready-to-show", () => {
		win.show();
	});

	// Load the index.html of the app
	win.loadFile(path.join(__dirname, "index.html"));

	// Open DevTools for debugging
	win.webContents.openDevTools();

	// When window closes empty the reference
	win.on("closed", () => {
		win = null;
	});
}

// When app is ready, create the window
app.on("ready", createWindow);

// Quit when all windows are closed
app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

// On macOS, recreate a window when the dock icon is clicked
app.on("activate", () => {
	if (win === null) {
		createWindow();
	}
});

// IPC handler to open file dialog and select image
ipcMain.handle("select-image-file", async () => {
	// Combine all supported formats and remove the dots
	const allFormats = new Set([...RAW_FORMATS, ...BITMAP_FORMATS]);

	// Convert to array and remove leading dots
	const extensions = Array.from(allFormats).map((ext) =>
		ext.replace(".", "")
	);

	const result = await dialog.showOpenDialog(win, {
		properties: ["openFile"],
		filters: [
			{
				name: "Supported Images",
				extensions: extensions,
			},
			{ name: "All Files", extensions: ["*"] },
		],
	});

	if (result.canceled || result.filePaths.length === 0) {
		return null;
	}

	return result.filePaths[0];
});

// ============================================================
// IPC Handlers
// ============================================================

// Main desqueeze handler - processes file based on format
ipcMain.handle("desqueeze-file", async (event, filePath) => {
	try {
		const ext = path.extname(filePath).toLowerCase();
		let outputPath;

		if (RAW_FORMATS.has(ext)) {
			outputPath = await processRAW(filePath, ext);
		} else if (BITMAP_FORMATS.has(ext)) {
			outputPath = await processBitmap(filePath, ext);
		} else {
			throw new Error(`File format ${ext} is not supported`);
		}

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
});

// ============================================================
// Processing Functions
// ============================================================

// Process RAW files: Convert to DNG + set DefaultScale metadata
async function processRAW(filePath, ext) {
	let outputPath = filePath;

	// Convert non-DNG RAW files to DNG
	if (ext !== ".dng") {
		console.log("Converting RAW to DNG...");
		outputPath = await convertToDNG(filePath);
	} else {
		// For existing DNG, create a copy with -desqueezed suffix
		const outputDir = path.dirname(filePath);
		const baseName = path.basename(filePath, ext);
		outputPath = path.join(outputDir, `${baseName}-desqueezed.dng`);
		await fs.copyFile(filePath, outputPath);
	}

	// Set DefaultScale metadata for anamorphic correction
	console.log(`Setting DefaultScale to ${ratioX} ${ratioY}...`);
	await exiftool.write(
		outputPath,
		{ DefaultScale: `${ratioX} ${ratioY}` },
		["-overwrite_original"]
	);

	console.log("RAW processed:", outputPath);
	return outputPath;
}

// Process Bitmap files: Stretch pixels + save as TIFF
async function processBitmap(filePath, ext) {
	const outputDir = path.dirname(filePath);
	const baseName = path.basename(filePath, ext);
	const outputPath = path.join(outputDir, `${baseName}-desqueezed.tiff`);

	console.log("Stretching bitmap...");
	await stretchBitmap(filePath, outputPath, ratioX);

	console.log("Bitmap processed:", outputPath);
	return outputPath;
}

// ============================================================
// Conversion Utilities
// ============================================================

// Convert RAW to DNG using bundled DNGLab binary
async function convertToDNG(inputPath) {
	const outputDir = path.dirname(inputPath);
	const baseName = path.basename(inputPath, path.extname(inputPath));
	const outputPath = path.join(outputDir, `${baseName}-desqueezed.dng`);

	try {
		// Get the bundled dnglab binary path
		const dnglabPath = getDNGLabPath();

		console.log("DNGLab binary path:", dnglabPath);

		// Check if binary exists
		try {
			await fs.access(dnglabPath);
		} catch {
			throw new Error(`DNGLab binary not found at: ${dnglabPath}`);
		}

		// Use dnglab convert command with compression options
		// --compression lossless: Reduces file size while preserving quality
		// --dng-preview false: Removes preview to reduce size (OS previews don't respect aspect ratio anyway)
		const command = `"${dnglabPath}" convert --embed-raw false --dng-preview true --override "${inputPath}" "${outputPath}"`;

		console.log("Running:", command);
		const { stdout, stderr } = await execAsync(command, {
			maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large images
		});

		if (stderr) {
			console.log("DNGLab stderr:", stderr);
		}
		if (stdout) {
			console.log("DNGLab stdout:", stdout);
		}

		// Check if output file was created
		try {
			await fs.access(outputPath);
			console.log("DNG file created successfully:", outputPath);
			return outputPath;
		} catch {
			throw new Error(`DNG file was not created at: ${outputPath}`);
		}
	} catch (error) {
		console.error("Conversion error:", error);
		throw new Error(`Failed to convert to DNG: ${error.message}`);
	}
}

// Stretch bitmap using Sharp and copy metadata
async function stretchBitmap(inputPath, outputPath, stretchFactor) {
	try {
		const image = sharp(inputPath);
		const metadata = await image.metadata();
		const newWidth = Math.round(metadata.width * stretchFactor);

		console.log(
			`Stretching: ${metadata.width}x${metadata.height} -> ${newWidth}x${metadata.height}`
		);

		await image
			.resize({
				width: newWidth,
				height: metadata.height,
				fit: "fill",
				kernel: "lanczos3",
			})
			.tiff({
				compression: "lzw",
				predictor: "horizontal",
			})
			.toFile(outputPath);

		// Check if output file was created
		try {
			await fs.access(outputPath);
			console.log("TIFF file created successfully:", outputPath);
		} catch {
			throw new Error(`TIFF file was not created at: ${outputPath}`);
		}

		// Copy all metadata from original file to the new TIFF
		console.log("Copying metadata from original file...");
		await exiftool.write(outputPath, {}, [
			"-overwrite_original",
			"-TagsFromFile",
			inputPath,
			"-all:all",
		]);
		console.log("Metadata copied successfully");

		return outputPath;
	} catch (error) {
		console.error("Sharp conversion error:", error);
		throw new Error(`Failed to stretch with Sharp: ${error.message}`);
	}
}

// Clean up exiftool when app quits
app.on("quit", async () => {
	await exiftool.end();
});
