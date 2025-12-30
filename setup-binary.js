#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

console.log("Setting up DNGLab binary for packaging...\n");

const platform = process.platform;
const binDir = path.join(__dirname, "resources", "bin", platform);
const binaryName = platform === "win32" ? "dnglab.exe" : "dnglab";
const targetPath = path.join(binDir, binaryName);

// Create directory if it doesn't exist
if (!fs.existsSync(binDir)) {
	fs.mkdirSync(binDir, { recursive: true });
	console.log(`Created directory: ${binDir}`);
}

// Check if binary already exists
if (fs.existsSync(targetPath)) {
	console.log(`✓ DNGLab binary already exists at: ${targetPath}`);
	const stats = fs.statSync(targetPath);
	console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
	process.exit(0);
}

// Try to find dnglab in PATH
try {
	const dnglabPath = execSync("which dnglab", { encoding: "utf-8" }).trim();
	console.log(`Found dnglab at: ${dnglabPath}`);

	// Copy to resources
	fs.copyFileSync(dnglabPath, targetPath);
	fs.chmodSync(targetPath, 0o755);

	const stats = fs.statSync(targetPath);
	console.log(`✓ Copied dnglab binary to: ${targetPath}`);
	console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
	console.log("\nThe binary is now bundled with your app!");
	console.log('Run "npm run dist" to build the distributable app.');
} catch (error) {
	console.error("❌ dnglab not found in PATH");
	console.error("\nPlease install dnglab first:");
	console.error("  macOS:   brew install dnglab");
	console.error(
		"  Windows: Download from https://github.com/dnglab/dnglab/releases"
	);
	console.error(
		"  Linux:   Download from https://github.com/dnglab/dnglab/releases"
	);
	console.error("\nThen run this script again: npm run setup");
	process.exit(1);
}
