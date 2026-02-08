/**
 * CommandRunner - Executes external CLI commands with structured output handling
 *
 * Wraps child_process.execFile with logging, buffer management,
 * and stderr classification (some CLIs write progress to stderr).
 */

import { promisify } from "util";
import { execFile } from "child_process";
import log from "../logger.js";

const execFileAsync = promisify(execFile);

class CommandRunner {
	/**
	 * @param {Object} [options]
	 * @param {number} [options.maxBuffer=10485760] - Max stdout/stderr buffer in bytes (default 10 MB)
	 */
	constructor({ maxBuffer = 10 * 1024 * 1024 } = {}) {
		this._maxBuffer = maxBuffer;
	}

	/**
	 * Execute a command with arguments.
	 * @param {string} binaryPath - Absolute path to the executable
	 * @param {string[]} args - Command arguments
	 * @returns {Promise<{stdout: string, stderr: string}>}
	 * @throws {Error} If the command exits with a non-zero code
	 */
	async exec(binaryPath, args) {
		log.info(`Running: ${binaryPath} ${args.join(" ")}`);

		try {
			const { stdout, stderr } = await execFileAsync(binaryPath, args, {
				maxBuffer: this._maxBuffer,
			});

			if (stderr) {
				log.debug(`Command stderr (may be informational): ${stderr.trim()}`);
			}
			if (stdout) {
				log.debug(`Command stdout: ${stdout.trim()}`);
			}

			return { stdout, stderr };
		} catch (error) {
			const exitCode = error.code ?? "unknown";
			log.error(
				`Command failed (exit ${exitCode}): ${binaryPath} ${args.join(" ")}`
			);
			if (error.stderr) {
				log.error(`stderr: ${error.stderr.trim()}`);
			}
			throw error;
		}
	}
}

export { CommandRunner };
