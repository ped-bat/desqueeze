const path = require("path");
const { app } = require("electron");
const { promisify } = require("util");
const { exec } = require("child_process");
const fs = require("fs").promises;
const { exiftool } = require("exiftool-vendored");

const execAsync = promisify(exec);

// Get the bundled DNGLab binary path
function getDNGLabPath() {
	const platform = process.platform;
	const binaryName = platform === "win32" ? "dnglab.exe" : "dnglab";
	const basePath = app.isPackaged
		? process.resourcesPath
		: path.join(__dirname, "../..");
	return path.join(
		basePath,
		app.isPackaged ? "bin" : "resources/bin",
		platform,
		binaryName
	);
}

// Convert RAW to DNG using bundled DNGLab binary
async function convertToDNG(inputPath) {
	const outputDir = path.dirname(inputPath);
	const baseName = path.basename(inputPath, path.extname(inputPath));
	const outputPath = path.join(outputDir, `${baseName}-desqueezed.dng`);

	// Get the bundled dnglab binary path
	const dnglabPath = getDNGLabPath();
	console.log("DNGLab binary path:", dnglabPath);

	// Check if binary exists
	try {
		await fs.access(dnglabPath);
	} catch {
		throw new Error(`DNGLab binary not found at: ${dnglabPath}`);
	}

	// Use dnglab convert command
	const command = `"${dnglabPath}" convert --embed-raw false --dng-preview true --override "${inputPath}" "${outputPath}"`;

	console.log("Running:", command);
	const { stdout, stderr } = await execAsync(command, {
		maxBuffer: 10 * 1024 * 1024,
	});

	if (stderr) console.log("DNGLab stderr:", stderr);
	if (stdout) console.log("DNGLab stdout:", stdout);

	// Check if output file was created
	try {
		await fs.access(outputPath);
		console.log("DNG file created successfully:", outputPath);
		return outputPath;
	} catch {
		throw new Error(`DNG file was not created at: ${outputPath}`);
	}
}

// Set DefaultScale metadata on DNG file
async function setDefaultScale(filePath, ratioX, ratioY) {
	console.log(`Setting DefaultScale to ${ratioX} ${ratioY}...`);
	await exiftool.write(filePath, { DefaultScale: `${ratioX} ${ratioY}` }, [
		"-overwrite_original",
	]);
}

module.exports = {
	convertToDNG,
	setDefaultScale,
};
