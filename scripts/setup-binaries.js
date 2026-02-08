#!/usr/bin/env node

/**
 * Setup Binaries — Updates bundled binaries and camera support.
 *
 * Flow:
 *   1. Check latest versions online (GitHub releases)
 *   2. Update project binaries (download if newer available)
 *   3. Warn if system binaries are behind bundled versions
 *   4. Diff camera support (dnglab camera list vs cameras.json)
 *   5. New cameras → added with today's date, no version (filled by dist)
 *   6. Log new camera support if any changes detected
 *
 * Usage: npm run setup
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { updateBinaries } from "./lib/update-binaries.js";

const rootDir = path.resolve(import.meta.dirname, "..");
const binDir = path.join(rootDir, "resources", "bin", process.platform);
const camerasPath = path.join(rootDir, "resources", "cameras.json");
const logsDir = path.join(rootDir, "logs");

// ── Colors ─────────────────────────────────────────────────

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RESET = "\x1b[0m";

// ── Helpers ────────────────────────────────────────────────

function today() {
	return new Date().toISOString().split("T")[0];
}

// ── Cameras JSON ───────────────────────────────────────────

function loadCameras() {
	if (!fs.existsSync(camerasPath)) return [];
	return JSON.parse(fs.readFileSync(camerasPath, "utf-8"));
}

function saveCameras(cameras) {
	fs.writeFileSync(camerasPath, JSON.stringify(cameras, null, "\t") + "\n");
}

function cameraKey(cam) {
	return `${cam.make}\t${cam.model}\t${cam.formats}`;
}

// ── Camera list from dnglab ────────────────────────────────

function getDnglabCameras() {
	const dnglabBin = path.join(binDir, "dnglab");
	if (!fs.existsSync(dnglabBin)) return null;
	try {
		const raw = execSync(`"${dnglabBin}" cameras`, { encoding: "utf-8" });
		const cameras = [];
		for (const line of raw.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("---") || trimmed.includes("total)")) continue;
			const parts = trimmed.split(/\s{2,}/);
			if (parts.length >= 2) {
				cameras.push({
					make: parts[0].trim(),
					model: parts[1].trim(),
					formats: (parts[2] || "all").trim(),
				});
			}
		}
		return cameras;
	} catch {
		return null;
	}
}

// ── Diff cameras ───────────────────────────────────────────

function diffAndUpdateCameras() {
	const dnglabCameras = getDnglabCameras();
	if (!dnglabCameras) {
		console.log(`  ${YELLOW}⚠${RESET} Could not read dnglab camera list`);
		return [];
	}

	const cameras = loadCameras();
	const existing = new Set(cameras.map(cameraKey));
	const dateStr = today();
	const newCameras = [];

	for (const cam of dnglabCameras) {
		const key = cameraKey(cam);
		if (!existing.has(key)) {
			cameras.push({
				make: cam.make,
				model: cam.model,
				formats: cam.formats,
				dateAdded: dateStr,
				version: null,
			});
			newCameras.push(cam);
		}
	}

	saveCameras(cameras);
	return newCameras;
}

// ── Log ────────────────────────────────────────────────────

function saveLog(newCameras) {
	if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

	const dateStr = today();
	const logPath = path.join(logsDir, `setup-${dateStr}.log`);

	const lines = [
		`Setup — ${dateStr}`,
		"",
		`New cameras: ${newCameras.length}`,
	];

	if (newCameras.length > 0) {
		lines.push("");
		for (const cam of newCameras) {
			lines.push(`  + ${cam.make} ${cam.model} (${cam.formats})`);
		}
	}

	lines.push("");
	fs.writeFileSync(logPath, lines.join("\n"));
	return logPath;
}

// ── Main ───────────────────────────────────────────────────

async function main() {
	console.log(`\n${BOLD}Setting up binaries${RESET}`);

	await updateBinaries();

	console.log(`\n${BOLD}Checking camera support${RESET}\n`);

	const newCameras = diffAndUpdateCameras();

	if (newCameras.length > 0) {
		console.log(`  ${GREEN}+${newCameras.length}${RESET} new camera(s) detected:\n`);
		for (const cam of newCameras) {
			console.log(`    + ${cam.make} ${cam.model} ${DIM}(${cam.formats})${RESET}`);
		}

		const logPath = saveLog(newCameras);
		console.log(`\n  ${DIM}Log saved: ${path.relative(rootDir, logPath)}${RESET}`);
		console.log(`  ${DIM}Version will be stamped when you run: npm run dist${RESET}`);
	} else {
		console.log(`  No new cameras detected`);
	}

	const cameras = loadCameras();
	const unversioned = cameras.filter((c) => !c.version);
	if (unversioned.length > 0) {
		console.log(`\n  ${YELLOW}⚠${RESET} ${unversioned.length} camera(s) pending version assignment (run ${BOLD}npm run dist${RESET})`);
	}

	console.log(`\n──────────────────────────────────────`);
	console.log(`${GREEN}✓${RESET} Setup complete.\n`);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
