#!/usr/bin/env node

/**
 * Dist — Release + build workflow.
 *
 * Flow:
 *   1. Update binaries (check online → update project → warn if system behind)
 *   2. Diff camera support → new cameras get date, no version
 *   3. Bump version in package.json
 *   4. Stamp all unversioned cameras with the new version
 *   5. Update README (RAW formats + camera count from dnglab)
 *   6. Generate release notes draft (with camera table) + wait for save
 *   7. Build distributable
 *   8. Save build log
 *
 * Usage:
 *   npm run dist              (patch bump, default)
 *   npm run dist -- minor
 *   npm run dist -- major
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { updateBinaries } from "./lib/update-binaries.js";
import { DIM, BOLD, GREEN, YELLOW, RED, RESET, heading } from "./lib/term.js";
import { today, loadCameras, discoverNewCameras, stampUnversionedCameras } from "./lib/cameras.js";
import { AppConfig } from "../src/main/config.js";

const rootDir = path.resolve(import.meta.dirname, "..");

const pkgPath = path.join(rootDir, "package.json");
const readmePath = path.join(rootDir, "README.md");
const releasesDir = path.join(rootDir, "releases");
const logsDir = path.join(rootDir, "logs");

const platform = process.platform;

// ── Version ────────────────────────────────────────────────

function bumpVersion(version, type) {
	const [major, minor, patch] = version.split(".").map(Number);
	switch (type) {
		case "major": return `${major + 1}.0.0`;
		case "minor": return `${major}.${minor + 1}.0`;
		default:      return `${major}.${minor}.${patch + 1}`;
	}
}

// ── Helpers ────────────────────────────────────────────────

function formatDate(isoDate) {
	const d = new Date(isoDate + "T00:00:00");
	return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Release notes ──────────────────────────────────────────

function generateDraft(version, date, stampedCameras) {
	const lines = [
		`# Version ${version} (${formatDate(date)})`,
		"",
		"## New feature goes here",
		"Description goes here",
		"",
		"## Added camera support",
	];

	if (stampedCameras.length > 0) {
		lines.push("");
		lines.push("| Make | Model | Formats |");
		lines.push("| --- | --- | --- |");
		for (const cam of stampedCameras) {
			lines.push(`| ${cam.make} | ${cam.model} | ${cam.formats} |`);
		}
	} else {
		lines.push("No new cameras in this release.");
	}

	lines.push("");
	lines.push("## Bugs fixed");
	lines.push("Description goes here");
	lines.push("");

	return lines.join("\n");
}

// ── Interactive ────────────────────────────────────────────

function watchForSave(filePath) {
	return new Promise((resolve) => {
		const initialMtime = fs.statSync(filePath).mtimeMs;
		console.log(`\n${DIM}Watching for changes to ${path.basename(filePath)}…${RESET}`);
		console.log(`${DIM}Save the file when you're done editing to continue.${RESET}\n`);

		const watcher = fs.watch(filePath, () => {
			try {
				const currentMtime = fs.statSync(filePath).mtimeMs;
				if (currentMtime > initialMtime) {
					watcher.close();
					resolve();
				}
			} catch {
				// File may be temporarily unavailable during save
			}
		});
	});
}

// ── README update ──────────────────────────────────────────

function updateReadme() {
	let readme = fs.readFileSync(readmePath, "utf-8");

	// Update RAW formats section
	const formats = Array.from(AppConfig.RAW_FORMATS).sort();
	const formatLine = formats.map((f) => `\`${f}\``).join(" ");
	const rawSection = [
		"<!-- BEGIN:RAW_FORMATS -->",
		"### Supported RAW Formats",
		"",
		formatLine,
		"<!-- END:RAW_FORMATS -->",
	].join("\n");
	readme = readme.replace(
		/<!-- BEGIN:RAW_FORMATS -->[\s\S]*?<!-- END:RAW_FORMATS -->/,
		rawSection,
	);

	// Update supported cameras section
	const cameras = loadCameras();
	const makes = new Set(cameras.map((c) => c.make));
	const cameraSection = [
		"<!-- BEGIN:SUPPORTED_CAMERAS -->",
		"### Supported Cameras",
		"",
		`${cameras.length} cameras from ${makes.size} manufacturers — see [cameras.json](resources/cameras.json) for the full list.`,
		"<!-- END:SUPPORTED_CAMERAS -->",
	].join("\n");
	readme = readme.replace(
		/<!-- BEGIN:SUPPORTED_CAMERAS -->[\s\S]*?<!-- END:SUPPORTED_CAMERAS -->/,
		cameraSection,
	);

	fs.writeFileSync(readmePath, readme);
	return { formatCount: formats.length, cameraCount: cameras.length, makeCount: makes.size };
}

// ── Build log ──────────────────────────────────────────────

function saveBuildLog(version, stampedCameras) {
	if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

	const logPath = path.join(logsDir, `build-v${version}.log`);
	const lines = [
		`Build — v${version} — ${today()}`,
		"",
		`New camera support: ${stampedCameras.length}`,
	];

	if (stampedCameras.length > 0) {
		lines.push("");
		for (const cam of stampedCameras) {
			lines.push(`  + ${cam.make} ${cam.model} (${cam.formats})`);
		}
	}

	lines.push("");
	fs.writeFileSync(logPath, lines.join("\n"));
	return logPath;
}

// ── Main ───────────────────────────────────────────────────

async function main() {
	const bumpType = process.argv[2] || "patch";
	if (!["major", "minor", "patch"].includes(bumpType)) {
		console.error(`Invalid bump type: "${bumpType}". Use: major | minor | patch`);
		process.exit(1);
	}

	const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
	const oldVersion = pkg.version;
	const newVersion = bumpVersion(oldVersion, bumpType);
	const date = today();

	console.log(`\n${BOLD}Desqueeze${RESET} ${DIM}— Preparing release${RESET}`);
	console.log(`${DIM}Version: ${oldVersion} → ${RESET}${GREEN}${newVersion}${RESET} ${DIM}(${bumpType})${RESET}`);

	// ── Step 1: Update binaries ─────────────────────────────
	heading(1, "Updating binaries");
	await updateBinaries();

	// ── Step 2: Camera support ──────────────────────────────
	heading(2, "Checking camera support");
	const newCameras = discoverNewCameras();

	if (newCameras.length > 0) {
		console.log(`  ${GREEN}+${newCameras.length}${RESET} new camera(s) detected`);
	} else {
		console.log(`  No new cameras detected`);
	}

	// ── Step 3: Bump version ────────────────────────────────
	heading(3, "Bumping version");
	pkg.version = newVersion;
	fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, "\t") + "\n");
	console.log(`  ${GREEN}✓${RESET} package.json → ${newVersion}`);

	// ── Step 4: Stamp unversioned cameras ───────────────────
	heading(4, "Stamping camera support");
	const stamped = stampUnversionedCameras(newVersion);

	if (stamped.length > 0) {
		console.log(`  ${GREEN}+${stamped.length}${RESET} camera(s) tagged with v${newVersion}:\n`);
		for (const cam of stamped) {
			console.log(`    + ${cam.make} ${cam.model} ${DIM}(${cam.formats})${RESET}`);
		}
	} else {
		console.log(`  No unversioned cameras to stamp`);
	}

	// ── Step 5: Update README ───────────────────────────────
	heading(5, "Updating README");
	const readmeStats = updateReadme();
	console.log(`  ${GREEN}✓${RESET} ${readmeStats.formatCount} RAW formats, ${readmeStats.cameraCount} cameras from ${readmeStats.makeCount} manufacturers`);

	// ── Step 6: Release notes ───────────────────────────────
	heading(6, "Release notes");

	if (!fs.existsSync(releasesDir)) fs.mkdirSync(releasesDir, { recursive: true });
	const notesFilename = `v${newVersion}.md`;
	const notesPath = path.join(releasesDir, notesFilename);

	const draft = generateDraft(newVersion, date, stamped);
	fs.writeFileSync(notesPath, draft);
	console.log(`  Created ${BOLD}releases/${notesFilename}${RESET}`);

	// Try to open in editor
	try {
		if (process.env.TERM_PROGRAM === "vscode") {
			const codePaths = [
				"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
				"/usr/local/bin/code",
			];
			const codeBin = codePaths.find((p) => fs.existsSync(p));
			if (codeBin) {
				execSync(`"${codeBin}" "${notesPath}"`, { stdio: "ignore" });
			} else {
				execSync(`open "${notesPath}"`, { stdio: "ignore" });
			}
		} else if (platform === "darwin") {
			execSync(`open "${notesPath}"`, { stdio: "ignore" });
		} else if (platform === "linux") {
			execSync(`xdg-open "${notesPath}"`, { stdio: "ignore" });
		} else if (platform === "win32") {
			execSync(`start "" "${notesPath}"`, { stdio: "ignore" });
		}
	} catch {
		// Silently continue
	}

	console.log(`\n  ${YELLOW}▸ Edit the release notes, then save the file to continue.${RESET}`);
	console.log(`  ${DIM}The build will start automatically after you save.${RESET}`);

	await watchForSave(notesPath);
	console.log(`  ${GREEN}✓${RESET} Release notes saved`);

	// ── Step 7: Build ───────────────────────────────────────
	heading(7, "Building distributable");

	try {
		execSync("npx electron-vite build", { cwd: rootDir, stdio: "inherit" });
		execSync("npx electron-builder", { cwd: rootDir, stdio: "inherit" });
	} catch {
		console.error(`\n${RED}❌ Build failed.${RESET} Version has been bumped to ${newVersion}.`);
		console.error(`Fix the issue and run: npx electron-vite build && npx electron-builder`);
		process.exit(1);
	}

	// ── Step 8: Save build log ──────────────────────────────
	const logPath = saveBuildLog(newVersion, stamped);

	// ── Done ────────────────────────────────────────────────
	console.log(`\n${BOLD}──────────────────────────────────────${RESET}`);
	console.log(`${GREEN}✓${RESET} ${BOLD}Desqueeze v${newVersion}${RESET} built successfully.`);
	console.log("");
	console.log(`  Release notes: ${DIM}releases/${notesFilename}${RESET}`);
	console.log(`  Build log:     ${DIM}${path.relative(rootDir, logPath)}${RESET}`);
	console.log(`  Commit:  ${DIM}git add -A && git commit -m "release: v${newVersion}"${RESET}`);
	console.log(`  Tag:     ${DIM}git tag v${newVersion}${RESET}`);
}

main().catch((err) => {
	console.error(`${RED}Fatal:${RESET}`, err.message);
	process.exit(2);
});
