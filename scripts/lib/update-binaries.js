/**
 * Shared binary update module — used by both setup and dist.
 *
 * Flow for each dependency:
 *   1. Check latest version online (GitHub releases API)
 *   2. Check system version (brew info)
 *      2a. If system is behind latest → upgrade via brew
 *   3. Copy system binary into project resources/bin/{platform}/
 *   4. Update dependencies.json manifest
 *
 * Exports:
 *   updateBinaries()  — runs the full flow, returns summary
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// ── Colors ─────────────────────────────────────────────────

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";

// ── Paths ──────────────────────────────────────────────────

const rootDir = path.resolve(import.meta.dirname, "..", "..");
const manifestPath = path.join(rootDir, "resources", "dependencies.json");
const currentPlatform = process.platform;

function binDirForPlatform(plat) {
	return path.join(rootDir, "resources", "bin", plat);
}

// ── Helpers ────────────────────────────────────────────────

function findInPath(name) {
	const cmd = currentPlatform === "win32" ? "where" : "which";
	try {
		return execSync(`${cmd} ${name}`, { encoding: "utf-8" }).trim();
	} catch {
		return null;
	}
}

/**
 * Compare two semver-like strings. Returns:
 *   -1 if a < b, 0 if a == b, 1 if a > b
 */
function compareSemver(a, b) {
	const pa = a.replace(/^v/, "").split(".").map(Number);
	const pb = b.replace(/^v/, "").split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const na = pa[i] || 0;
		const nb = pb[i] || 0;
		if (na < nb) return -1;
		if (na > nb) return 1;
	}
	return 0;
}

// ── Version detection ──────────────────────────────────────

/**
 * Get the system-installed version of a dependency.
 * Uses systemVersionCommand (e.g. brew info) if available,
 * otherwise falls back to running the binary's versionCommand.
 */
function getSystemVersion(dep) {
	// Try platform-specific system version command first (e.g. brew info)
	const sysCmd = dep.systemVersionCommand?.[currentPlatform];
	if (sysCmd) {
		try {
			return execSync(sysCmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
		} catch {
			// fall through
		}
	}

	// Fall back to running the binary directly
	if (!dep.versionCommand) return null;
	const systemPath = findInPath(dep.binary);
	if (!systemPath) return null;

	try {
		const out = execSync(`"${systemPath}" ${dep.versionCommand}`, {
			encoding: "utf-8",
		}).trim();
		if (dep.versionParser === "split") {
			return out.split(/\s+/)[1] || null;
		}
		return null;
	} catch {
		return null;
	}
}

// ── GitHub API ─────────────────────────────────────────────

async function getLatestRelease(repo) {
	const url = `https://api.github.com/repos/${repo}/releases/latest`;
	try {
		const res = await fetch(url, {
			headers: { "User-Agent": "desqueeze-setup" },
		});
		if (!res.ok) return null;
		const data = await res.json();
		return data.tag_name.replace(/^v/, "");
	} catch {
		return null;
	}
}

// ── System upgrade ─────────────────────────────────────────

function upgradeSystem(dep) {
	const cmd = dep.systemUpgradeCommand?.[currentPlatform];
	if (!cmd) return false;

	try {
		process.stdout.write(`  ⏳ Upgrading via ${cmd.split(" ").slice(0, 3).join(" ")}…`);
		execSync(cmd, { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] });
		process.stdout.write(`\r  ${GREEN}✓${RESET} System upgraded                                    \n`);
		return true;
	} catch (err) {
		process.stdout.write(`\r  ${RED}✗${RESET} Upgrade failed: ${err.message?.split("\n")[0]}       \n`);
		return false;
	}
}

// ── Copy from system ───────────────────────────────────────

function copyFromSystem(dep, targetPath) {
	const systemPath = findInPath(dep.binary);
	if (!systemPath) {
		console.log(`  ${RED}✗${RESET} ${dep.binary}: not found in PATH`);
		const hint = dep.installHint?.[currentPlatform];
		if (hint) console.log(`    ${DIM}Install: ${hint}${RESET}`);
		return false;
	}

	const dir = path.dirname(targetPath);
	if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

	const resolvedPath = fs.realpathSync(systemPath);
	if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
	fs.copyFileSync(resolvedPath, targetPath);
	fs.chmodSync(targetPath, 0o755);
	return true;
}

// ── Main flow ──────────────────────────────────────────────

/**
 * Run the full binary update flow.
 * @returns {Promise<Object>} Summary of what happened
 */
export async function updateBinaries() {
	const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
	const binDir = binDirForPlatform(currentPlatform);
	const summary = { updated: [], warnings: [], errors: [] };

	for (const [depName, dep] of Object.entries(manifest)) {
		console.log(`\n  ${BOLD}${dep.binary}${RESET}`);

		const projectVersion = dep.version;
		const binaryName = currentPlatform === "win32" ? `${dep.binary}.exe` : dep.binary;
		const binPath = path.join(binDir, binaryName);

		// ── Step 1: Check latest online version ─────────────
		const latestVersion = await getLatestRelease(dep.repo);

		if (!latestVersion) {
			console.log(`  ${YELLOW}⚠${RESET} Could not check latest version online`);
		} else if (compareSemver(projectVersion, latestVersion) < 0) {
			console.log(`  ${CYAN}⬆${RESET} New version available: ${projectVersion} → ${GREEN}${latestVersion}${RESET}`);
		} else {
			console.log(`  ${DIM}Latest online: ${latestVersion} (up to date)${RESET}`);
		}

		const targetVersion = latestVersion && compareSemver(projectVersion, latestVersion) < 0
			? latestVersion
			: projectVersion;

		// ── Step 2: Check system version ────────────────────
		let systemVersion = getSystemVersion(dep);

		if (!systemVersion) {
			// Not installed at all
			console.log(`  ${YELLOW}⚠${RESET} ${dep.binary} not found on system`);
			const hint = dep.installHint?.[currentPlatform];
			if (hint) {
				console.log(`    ${DIM}Install: ${hint}${RESET}`);
			}
			summary.errors.push({ dep: depName, message: "Not installed on system" });

			// If we have a bundled copy, keep it
			if (fs.existsSync(binPath)) {
				const size = (fs.statSync(binPath).size / 1024 / 1024).toFixed(2);
				console.log(`  ${YELLOW}⚠${RESET} Keeping existing bundled copy (${size} MB)`);
			}
			continue;
		}

		// ── Step 2a: Upgrade system if behind ───────────────
		if (compareSemver(systemVersion, targetVersion) < 0) {
			console.log(`  ${YELLOW}⚠${RESET} System version ${systemVersion} is behind ${targetVersion}`);
			const upgraded = upgradeSystem(dep);
			if (upgraded) {
				systemVersion = getSystemVersion(dep);
				if (systemVersion) {
					console.log(`  ${GREEN}✓${RESET} System now at ${systemVersion}`);
				}
			} else {
				console.log(`  ${YELLOW}⚠${RESET} Continuing with system version ${systemVersion}`);
				summary.warnings.push({
					dep: depName,
					message: `System ${dep.binary} (${systemVersion}) is behind latest (${targetVersion})`,
				});
			}
		}

		// ── Step 3: Copy system binary into project ─────────
		const copied = copyFromSystem(dep, binPath);
		if (copied) {
			const finalVersion = systemVersion || projectVersion;
			const size = (fs.statSync(binPath).size / 1024 / 1024).toFixed(2);
			console.log(`  ${GREEN}✓${RESET} ${finalVersion} (${size} MB)`);

			// Update manifest if version changed
			if (finalVersion !== projectVersion) {
				manifest[depName].version = finalVersion;
				summary.updated.push({ dep: depName, from: projectVersion, to: finalVersion });
			}
		} else {
			summary.errors.push({ dep: depName, message: "Failed to copy binary" });
		}
	}

	// Save updated manifest
	fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, "\t") + "\n");

	return summary;
}
