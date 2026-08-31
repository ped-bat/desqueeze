/**
 * Shared camera-support tracking — used by both setup and dist.
 *
 * resources/cameras.json records every camera supported by the bundled
 * dnglab binary, together with the date it appeared and the app version
 * that first shipped it (version is stamped by the dist script).
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { YELLOW, RESET } from "./term.js";

const rootDir = path.resolve(import.meta.dirname, "..", "..");
const camerasPath = path.join(rootDir, "resources", "cameras.json");
const binDir = path.join(rootDir, "resources", "bin", process.platform);

export function today() {
	return new Date().toISOString().split("T")[0];
}

export function loadCameras() {
	if (!fs.existsSync(camerasPath)) return [];
	return JSON.parse(fs.readFileSync(camerasPath, "utf-8"));
}

export function saveCameras(cameras) {
	fs.writeFileSync(camerasPath, JSON.stringify(cameras, null, "\t") + "\n");
}

function cameraKey(cam) {
	return `${cam.make}\t${cam.model}\t${cam.formats}`;
}

/**
 * Read the camera list from the bundled dnglab binary.
 * @returns {Array<{make: string, model: string, formats: string}>|null}
 */
export function getDnglabCameras() {
	const binaryName = process.platform === "win32" ? "dnglab.exe" : "dnglab";
	const dnglabBin = path.join(binDir, binaryName);
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

/**
 * Diff dnglab's camera list against cameras.json. New cameras are appended
 * with today's date and no version (stamped later by the dist script).
 * @returns {Array} The newly discovered cameras
 */
export function discoverNewCameras() {
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

/**
 * Assign the given version to every camera that doesn't have one yet.
 * @param {string} version
 * @returns {Array} The cameras that were stamped
 */
export function stampUnversionedCameras(version) {
	const cameras = loadCameras();
	const stamped = [];

	for (const cam of cameras) {
		if (!cam.version) {
			cam.version = version;
			stamped.push({ ...cam });
		}
	}

	saveCameras(cameras);
	return stamped;
}
