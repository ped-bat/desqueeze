#!/usr/bin/env node

/**
 * Pre-flight check for test suite: ensures all binaries listed in
 * resources/dependencies.json are present in resources/bin/{platform}/,
 * and (on macOS) that they are self-contained — no Homebrew dylib
 * references, and all @executable_path-relative dylibs present.
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { RED, YELLOW, CYAN, RESET } from "./lib/term.js";

const rootDir = path.resolve(import.meta.dirname, "..");
const platform = process.platform;
const binDir = path.join(rootDir, "resources", "bin", platform);
const manifestPath = path.join(rootDir, "resources", "dependencies.json");

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
const missing = [];
const notSelfContained = [];

/**
 * On macOS, a bundled binary must not reference Homebrew dylibs (a
 * brew upgrade/uninstall would break it — dyld errors mid-test) and
 * its @executable_path-relative dylibs must exist next to it.
 * Returns a list of problems, empty if the binary is self-contained.
 */
function checkDarwinLinkage(binPath) {
	const problems = [];
	let out;
	try {
		out = execSync(`otool -L "${binPath}"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
	} catch {
		return problems; // otool unavailable — skip linkage check
	}
	const deps = out
		.split("\n")
		.slice(1)
		.map((line) => line.match(/^\t(\S+)/)?.[1])
		.filter(Boolean);
	for (const dep of deps) {
		if (dep.startsWith("/opt/homebrew/") || dep.startsWith("/usr/local/Cellar/") || dep.startsWith("/usr/local/opt/")) {
			problems.push(`links against ${dep}`);
		} else if (dep.startsWith("@executable_path/")) {
			const resolved = path.join(path.dirname(binPath), dep.replace("@executable_path/", ""));
			if (!fs.existsSync(resolved)) {
				problems.push(`missing bundled dylib ${dep}`);
			}
		}
	}
	return problems;
}

/**
 * On Linux, a bundled binary must resolve every shared object — either
 * from the system or from its $ORIGIN/lib rpath. `ldd` reporting
 * "not found" means the binary will fail at spawn time.
 * Static binaries (ldd errors out) are fine.
 */
function checkLinuxLinkage(binPath) {
	let out;
	try {
		out = execSync(`ldd "${binPath}"`, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
	} catch {
		return []; // static binary or ldd unavailable — nothing to check
	}
	return out
		.split("\n")
		.filter((line) => line.includes("not found"))
		.map((line) => `unresolved ${line.trim()}`);
}

console.log(`${CYAN}Verifying E2E test dependencies…${RESET}`);

for (const [, dep] of Object.entries(manifest)) {
	const name = platform === "win32" ? `${dep.binary}.exe` : dep.binary;
	const binPath = path.join(binDir, name);
	if (!fs.existsSync(binPath)) {
		missing.push(name);
	} else if (platform === "darwin") {
		for (const problem of checkDarwinLinkage(binPath)) {
			notSelfContained.push(`${name}: ${problem}`);
		}
	} else if (platform === "linux") {
		for (const problem of checkLinuxLinkage(binPath)) {
			notSelfContained.push(`${name}: ${problem}`);
		}
	}
}

// On Windows the bundled binaries import the VC++ runtime, which is absent
// from a clean Windows install. Dev machines and CI runners have it, so a
// missing copy here is invisible until an end user hits exit 0xC0000135.
if (platform === "win32") {
	for (const dll of ["VCRUNTIME140.dll", "MSVCP140.dll"]) {
		if (!fs.existsSync(path.join(binDir, dll))) {
			notSelfContained.push(`${dll}: missing (run scripts/bundle-msvc-runtime.js)`);
		}
	}
}

if (missing.length > 0 || notSelfContained.length > 0) {
	console.error(`\n${RED}🚨 BINARY PROBLEMS DETECTED 🚨${RESET}`);
	if (missing.length > 0) {
		console.error(`${YELLOW}The following executables are required but missing:${RESET}`);
		missing.forEach((m) => console.error(` - ${m}`));
	}
	if (notSelfContained.length > 0) {
		console.error(`${YELLOW}The following binaries are not self-contained:${RESET}`);
		notSelfContained.forEach((m) => console.error(` - ${m}`));
	}
	console.error(`\n${CYAN}Please run the setup command to fix them:${RESET}`);
	console.error(`\n    ${YELLOW}npm run setup${RESET}\n`);
	process.exit(1);
}

console.log(`${CYAN}✓ All binaries present. Starting tests…${RESET}\n`);
