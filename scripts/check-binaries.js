const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

// Colors for console output
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

const platform = os.platform();
const projectRoot = path.resolve(__dirname, "..");
const binDir = path.join(projectRoot, "resources/bin", platform);

const binaries = ["dnglab", "dcraw_emu"];

console.log(`${CYAN}Verifying E2E test dependencies...${RESET}`);

let missing = [];

for (const bin of binaries) {
	const name = platform === "win32" ? `${bin}.exe` : bin;
	const fullPath = path.join(binDir, name);

	if (!fs.existsSync(fullPath)) {
		missing.push(name);
	}
}

if (missing.length > 0) {
	console.error(`
${RED}🚨 MISSING BINARIES FOR TESTS 🚨${RESET}`);
	console.error(`${YELLOW}The following executables are required but missing:${RESET}`);
	missing.forEach(m => console.error(` - ${m}`));
	console.error(`
${CYAN}Please run the setup command to download them:${RESET}`);
	console.error(`
    ${YELLOW}npm run setup${RESET}
`);
	process.exit(1);
}

console.log(`${CYAN}✓ All binaries present. Starting tests...${RESET}
`);
process.exit(0);
