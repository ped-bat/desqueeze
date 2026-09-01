#!/usr/bin/env node

/**
 * Bundle the MSVC runtime DLLs next to the Windows binaries.
 *
 * dnglab.exe imports VCRUNTIME140.dll and dcraw_emu.exe imports MSVCP140.dll,
 * but neither ships with Windows — they come from the Visual C++
 * Redistributable. A machine without it fails at process start with exit
 * code 0xC0000135 (STATUS_DLL_NOT_FOUND) and no stderr at all, so the app
 * just reports "conversion failed" with nothing useful to go on.
 *
 * CI never caught this because GitHub's Windows runners have the
 * redistributable preinstalled; only a clean Windows install shows it.
 *
 * Copying these DLLs into the application directory is Microsoft's
 * documented "app-local deployment" and is permitted by the redistributable
 * license. We prefer the files from the VS "Redist" tree (the copies
 * intended for redistribution) and fall back to System32.
 *
 * Usage: node scripts/bundle-msvc-runtime.js   (no-op off Windows)
 */

import fs from "fs";
import path from "path";
import { GREEN, YELLOW, RED, DIM, RESET } from "./lib/term.js";

const rootDir = path.resolve(import.meta.dirname, "..");
const binDir = path.join(rootDir, "resources", "bin", "win32");

/** Required by dnglab.exe / dcraw_emu.exe; the _1 variants are optional. */
const REQUIRED = ["VCRUNTIME140.dll", "MSVCP140.dll"];
const OPTIONAL = ["VCRUNTIME140_1.dll", "MSVCP140_1.dll", "MSVCP140_2.dll"];

if (process.platform !== "win32") {
	console.log(`${DIM}Not Windows — skipping MSVC runtime bundling.${RESET}`);
	process.exit(0);
}

/** Collect candidate directories holding redistributable CRT DLLs. */
function redistDirs() {
	const dirs = [];
	const roots = [
		"C:\\Program Files\\Microsoft Visual Studio",
		"C:\\Program Files (x86)\\Microsoft Visual Studio",
	];

	for (const root of roots) {
		if (!fs.existsSync(root)) continue;
		// <root>/<year>/<edition>/VC/Redist/MSVC/<version>/x64/Microsoft.VC###.CRT
		for (const year of safeList(root)) {
			for (const edition of safeList(path.join(root, year))) {
				const msvc = path.join(root, year, edition, "VC", "Redist", "MSVC");
				for (const version of safeList(msvc)) {
					const x64 = path.join(msvc, version, "x64");
					for (const crt of safeList(x64)) {
						if (/^Microsoft\.VC\d+\.CRT$/i.test(crt)) {
							dirs.push(path.join(x64, crt));
						}
					}
				}
			}
		}
	}

	// Last resort: the installed runtime. Same binaries, less canonical source.
	dirs.push("C:\\Windows\\System32");
	return dirs;
}

function safeList(dir) {
	try {
		return fs.readdirSync(dir);
	} catch {
		return [];
	}
}

function findDll(name, dirs) {
	for (const dir of dirs) {
		const candidate = path.join(dir, name);
		if (fs.existsSync(candidate)) return candidate;
	}
	return null;
}

// ── Main ───────────────────────────────────────────────────

if (!fs.existsSync(binDir)) {
	console.error(`${RED}✗${RESET} ${binDir} does not exist — run setup-binaries.js first.`);
	process.exit(1);
}

const dirs = redistDirs();
const missing = [];

for (const name of [...REQUIRED, ...OPTIONAL]) {
	const src = findDll(name, dirs);
	const required = REQUIRED.includes(name);

	if (!src) {
		if (required) missing.push(name);
		else console.log(`  ${DIM}optional ${name} not found — skipping${RESET}`);
		continue;
	}

	const dst = path.join(binDir, name);
	fs.copyFileSync(src, dst);
	const size = (fs.statSync(dst).size / 1024).toFixed(0);
	console.log(`  ${GREEN}✓${RESET} ${name} (${size} KB) ${DIM}from ${path.dirname(src)}${RESET}`);
}

if (missing.length > 0) {
	console.error(`\n${RED}✗ Missing required runtime DLLs:${RESET} ${missing.join(", ")}`);
	console.error(`${YELLOW}Install the Visual C++ Redistributable, or Visual Studio Build Tools.${RESET}`);
	process.exit(1);
}

console.log(`${GREEN}✓${RESET} MSVC runtime bundled into resources/bin/win32/`);
