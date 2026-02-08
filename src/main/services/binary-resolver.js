/**
 * BinaryResolver - Locates bundled external binaries (DNGLab, dcraw_emu)
 *
 * Decoupled from electron.app so it can be tested outside Electron
 * by injecting a custom base path.
 */

import path from "path";
import fs from "fs/promises";
import log from "../logger.js";

class BinaryResolver {
	/**
	 * @param {Object} options
	 * @param {string} options.basePath - Root path for resources (e.g., app root or process.resourcesPath)
	 * @param {boolean} options.isPackaged - Whether the app is packaged (changes resource layout)
	 * @param {string} [options.platform] - Override platform (defaults to process.platform)
	 */
	constructor({ basePath, isPackaged, platform = process.platform }) {
		this._basePath = basePath;
		this._isPackaged = isPackaged;
		this._platform = platform;
	}

	/**
	 * Create a BinaryResolver using Electron's app object.
	 * @param {import("electron").App} app - Electron app instance
	 * @returns {BinaryResolver}
	 */
	static fromElectronApp(app) {
		const basePath = app.isPackaged
			? process.resourcesPath
			: app.getAppPath();
		return new BinaryResolver({
			basePath,
			isPackaged: app.isPackaged,
		});
	}

	/**
	 * Build the absolute path to a bundled binary.
	 * @param {string} name - Binary name (without .exe extension)
	 * @returns {string}
	 */
	_resolveBinaryPath(name) {
		const binaryName = this._platform === "win32" ? `${name}.exe` : name;
		const subDir = this._isPackaged ? "bin" : "resources/bin";
		return path.join(this._basePath, subDir, this._platform, binaryName);
	}

	/**
	 * Verify that a binary exists and is accessible.
	 * @param {string} binaryPath - Absolute path to the binary
	 * @param {string} displayName - Human-readable name for error messages
	 * @returns {Promise<string>} Resolved path to the binary
	 * @throws {Error} If binary not found
	 */
	async _verifyBinary(binaryPath, displayName) {
		try {
			await fs.access(binaryPath);
			return binaryPath;
		} catch (error) {
			log.error(`${displayName} binary check failed: ${error.message}`);
			throw new Error(
				`${displayName} binary not found at: ${binaryPath}. ` +
				`Run "npm run setup" to install it.`
			);
		}
	}

	// ── DNGLab ──────────────────────────────────────────────

	/** @returns {string} */
	getDNGLabPath() {
		return this._resolveBinaryPath("dnglab");
	}

	/** @returns {Promise<string>} */
	async verifyDNGLabBinary() {
		return this._verifyBinary(this.getDNGLabPath(), "DNGLab");
	}

	// ── dcraw_emu (LibRaw) ──────────────────────────────────

	/** @returns {string} */
	getDcrawEmuPath() {
		return this._resolveBinaryPath("dcraw_emu");
	}

	/** @returns {Promise<string>} */
	async verifyDcrawEmuBinary() {
		return this._verifyBinary(this.getDcrawEmuPath(), "dcraw_emu");
	}
}

export { BinaryResolver };
