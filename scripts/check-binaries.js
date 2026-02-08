#!/usr/bin/env node

/**
 * Pre-flight check for test suite: ensures all binaries listed in
 * resources/dependencies.json are present in resources/bin/{platform}/.
 */

import fs from "fs";
import path from "path";

const rootDir = path.resolve(import.meta.dirname, "..");
const platform = process.platform;
const binDir = path.join(rootDir, "resources", "bin", platform);
const manifestPath = path.join(rootDir, "resources", "dependencies.json");

const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
const missing = [];

console.log(`${CYAN}Verifying E2E test dependencies…${RESET}`);

for (const [, dep] of Object.entries(manifest)) {
	const name = platform === "win32" ? `${dep.binary}.exe` : dep.binary;
	if (!fs.existsSync(path.join(binDir, name))) {
		missing.push(name);
	}
}

if (missing.length > 0) {
	console.error(`\n${RED}🚨 MISSING BINARIES FOR TESTS 🚨${RESET}`);
	console.error(`${YELLOW}The following executables are required but missing:${RESET}`);
	missing.forEach((m) => console.error(` - ${m}`));
	console.error(`\n${CYAN}Please run the setup command to download them:${RESET}`);
	console.error(`\n    ${YELLOW}npm run setup${RESET}\n`);
	process.exit(1);
}

console.log(`${CYAN}✓ All binaries present. Starting tests…${RESET}\n`);
