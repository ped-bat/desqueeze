#!/usr/bin/env node

/**
 * Setup Binaries - Copies system-installed binaries into the app resources
 *
 * Binaries bundled:
 *   - dnglab    — RAW → DNG conversion
 *   - dcraw_emu — RAW → TIFF rendering (LibRaw)
 *
 * Usage: npm run setup
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const platform = process.platform;
const binDir = path.join(__dirname, "resources", "bin", platform);

// Create directory if it doesn't exist
if (!fs.existsSync(binDir)) {
	fs.mkdirSync(binDir, { recursive: true });
	console.log(`Created directory: ${binDir}`);
}

/**
 * Find a binary in PATH and copy it to resources/bin/{platform}/.
 *
 * @param {string} name - Binary name (e.g. "dnglab", "dcraw_emu")
 * @param {string} installHint - Instructions shown when the binary is missing
 */
function setupBinary(name, installHint) {
	const binaryName = platform === "win32" ? `${name}.exe` : name;
	const targetPath = path.join(binDir, binaryName);

	console.log(`\n── ${name} ──`);

	// Check if binary already exists in resources
	if (fs.existsSync(targetPath)) {
		const stats = fs.statSync(targetPath);
		console.log(`✓ Already bundled at: ${targetPath}`);
		console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
		return;
	}

	// Try to find binary in PATH
	const whichCmd = platform === "win32" ? "where" : "which";
	try {
		const systemPath = execSync(`${whichCmd} ${name}`, { encoding: "utf-8" }).trim();
		console.log(`Found in PATH: ${systemPath}`);

		fs.copyFileSync(systemPath, targetPath);
		fs.chmodSync(targetPath, 0o755);

		const stats = fs.statSync(targetPath);
		console.log(`✓ Copied to: ${targetPath}`);
		console.log(`  Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
	} catch (error) {
		console.error(`❌ ${name} not found in PATH`);
		console.error(installHint);
	}
}

// ── Setup all binaries ─────────────────────────────────────

console.log("Setting up binaries for packaging...");

setupBinary("dnglab", [
	"\nPlease install dnglab first:",
	"  macOS:   brew install dnglab",
	"  Windows: Download from https://github.com/dnglab/dnglab/releases",
	"  Linux:   Download from https://github.com/dnglab/dnglab/releases",
].join("\n"));

setupBinary("dcraw_emu", [
	"\nPlease install LibRaw first:",
	"  macOS:   brew install libraw",
	"  Windows: Download from https://www.libraw.org/download",
	"  Linux:   sudo apt install libraw-bin  (or equivalent)",
].join("\n"));

// ── Summary ────────────────────────────────────────────────

console.log("\n──────────────────────────────────────");
const expected = ["dnglab", "dcraw_emu"];
const missing = expected.filter((name) => {
	const binaryName = platform === "win32" ? `${name}.exe` : name;
	return !fs.existsSync(path.join(binDir, binaryName));
});

if (missing.length === 0) {
	console.log("✓ All binaries are bundled!");
	console.log('Run "npm run dist" to build the distributable app.');
} else {
	console.error(`❌ Missing binaries: ${missing.join(", ")}`);
	console.error("Install them and run this script again: npm run setup");
	process.exit(1);
}
