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
import { updateBinaries } from "./lib/update-binaries.js";
import { DIM, BOLD, GREEN, YELLOW, RESET } from "./lib/term.js";
import { today, loadCameras, discoverNewCameras } from "./lib/cameras.js";

const rootDir = path.resolve(import.meta.dirname, "..");
const logsDir = path.join(rootDir, "logs");

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

	const newCameras = discoverNewCameras();

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
