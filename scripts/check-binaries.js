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
