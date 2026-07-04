/**
 * Shared binary update module — used by both setup and dist.
 *
 * Flow for each dependency:
 *   1. Check latest version online (GitHub releases API)
 *   2. Check system version (brew info)
 *      2a. If system is behind latest → upgrade via brew
 *   3. Copy system binary into project resources/bin/{platform}/
 *      3a. On macOS, bundle any Homebrew dylibs the binary links against
 *          into resources/bin/darwin/lib/ and rewrite install names to
 *          @executable_path/lib/… so the bundled copy is self-contained
 *   4. Update dependencies.json manifest
 *
 * Exports:
 *   updateBinaries()      — runs the full flow, returns summary
 *   makeSelfContained()   — dylib bundling step for a single macOS binary
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { DIM, BOLD, GREEN, YELLOW, RED, CYAN, RESET } from "./term.js";

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
	// parseInt tolerates suffixes like brew's revision markers ("0.7.0_1")
	const pa = a.replace(/^v/, "").split(".").map((s) => parseInt(s, 10) || 0);
	const pb = b.replace(/^v/, "").split(".").map((s) => parseInt(s, 10) || 0);
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

// ── Self-contained dylib bundling (macOS) ──────────────────

/** Directory name (next to the binary) that holds bundled dylibs */
const DYLIB_DIR_NAME = "lib";

function isBrewDylibPath(p) {
	return (
		p.startsWith("/opt/homebrew/") ||
		p.startsWith("/usr/local/Cellar/") ||
		p.startsWith("/usr/local/opt/")
	);
}

/**
 * List the dylib install names a Mach-O file links against (via otool -L).
 * For dylibs the first entry is the file's own LC_ID_DYLIB — callers filter it.
 */
function getLinkedDylibs(machoPath) {
	const out = execSync(`otool -L "${machoPath}"`, {
		encoding: "utf-8",
		stdio: ["pipe", "pipe", "pipe"],
	});
	return out
		.split("\n")
		.slice(1) // drop the "path:" header line
		.map((line) => line.match(/^\t(\S+)/)?.[1])
		.filter(Boolean);
}

/**
 * Make a macOS binary self-contained: copy every Homebrew dylib in its
 * dependency closure into {binDir}/lib/ and rewrite install names to
 * @executable_path/lib/{name}, then ad-hoc re-sign (required on arm64,
 * where install_name_tool invalidates the signature).
 *
 * No-op for binaries with no Homebrew dependencies (e.g. static dnglab).
 *
 * @param {string} binPath - Absolute path to the copied binary
 * @returns {{bundled: string[], offenders: string[]}} bundled dylib names and
 *   any Homebrew references that survived rewriting (should be empty)
 */
export function makeSelfContained(binPath) {
	const libDir = path.join(path.dirname(binPath), DYLIB_DIR_NAME);

	// BFS over the Homebrew dylib closure, dedup'd by install-name basename
	// (e.g. /opt/homebrew/opt/... and /opt/homebrew/Cellar/... alias the same lib)
	const copied = new Map(); // basename → copied path
	const queue = [binPath];
	while (queue.length > 0) {
		const file = queue.shift();
		const selfName = path.basename(file);
		for (const dep of getLinkedDylibs(file).filter(isBrewDylibPath)) {
			const name = path.basename(dep);
			if (name === selfName || copied.has(name)) continue; // own ID / already copied
			const src = fs.realpathSync(dep);
			const dst = path.join(libDir, name);
			if (!fs.existsSync(libDir)) fs.mkdirSync(libDir, { recursive: true });
			// unlink first: overwriting in place trips macOS's signature cache
			if (fs.existsSync(dst)) fs.unlinkSync(dst);
			fs.copyFileSync(src, dst);
			fs.chmodSync(dst, 0o755);
			copied.set(name, dst);
			queue.push(dst);
		}
	}

	if (copied.size === 0) return { bundled: [], offenders: [] };

	// Rewrite install names in the binary and every bundled dylib
	for (const file of [binPath, ...copied.values()]) {
		const isDylib = file.endsWith(".dylib");
		const selfName = path.basename(file);
		const args = [];
		if (isDylib) {
			args.push("-id", `@executable_path/${DYLIB_DIR_NAME}/${selfName}`);
		}
		for (const dep of getLinkedDylibs(file).filter(isBrewDylibPath)) {
			const name = path.basename(dep);
			if (isDylib && name === selfName) continue; // LC_ID_DYLIB, handled by -id
			args.push("-change", dep, `@executable_path/${DYLIB_DIR_NAME}/${name}`);
		}
		if (args.length === 0) continue;
		const quoted = args.map((a) => `"${a}"`).join(" ");
		execSync(`install_name_tool ${quoted} "${file}"`, { stdio: ["pipe", "pipe", "pipe"] });
		execSync(`codesign --force --sign - "${file}"`, { stdio: ["pipe", "pipe", "pipe"] });
	}

	// Verify nothing still points at Homebrew
	const offenders = [];
	for (const file of [binPath, ...copied.values()]) {
		for (const dep of getLinkedDylibs(file).filter(isBrewDylibPath)) {
			offenders.push(`${path.basename(file)} → ${dep}`);
		}
	}

	return { bundled: [...copied.keys()], offenders };
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

			// ── Step 3a: Bundle Homebrew dylibs (macOS) ─────
			if (currentPlatform === "darwin") {
				try {
					const { bundled, offenders } = makeSelfContained(binPath);
					if (bundled.length > 0) {
						console.log(`  ${GREEN}✓${RESET} Bundled ${bundled.length} dylib(s): ${bundled.join(", ")}`);
					}
					if (offenders.length > 0) {
						console.log(`  ${RED}✗${RESET} Still linked against Homebrew:`);
						offenders.forEach((o) => console.log(`    ${DIM}${o}${RESET}`));
						summary.errors.push({ dep: depName, message: "Dylib bundling left Homebrew references" });
					}
				} catch (err) {
					console.log(`  ${RED}✗${RESET} Dylib bundling failed: ${err.message?.split("\n")[0]}`);
					summary.errors.push({ dep: depName, message: `Dylib bundling failed: ${err.message}` });
				}
			}

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
