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
	 * @param {number} [options.timeout=600000] - Kill the child after this many ms (default 10 min).
	 *   Prevents a hung binary from occupying a queue slot forever.
	 */
	constructor({ maxBuffer = 10 * 1024 * 1024, timeout = 10 * 60 * 1000 } = {}) {
		this._maxBuffer = maxBuffer;
		this._timeout = timeout;
	}

	/**
	 * Execute a command with arguments.
	 * @param {string} binaryPath - Absolute path to the executable
	 * @param {string[]} args - Command arguments
	 * @param {Object} [opts]
	 * @param {number} [opts.timeout] - Per-call timeout override in ms
	 * @returns {Promise<{stdout: string, stderr: string}>}
	 * @throws {Error} If the command exits with a non-zero code or times out
	 */
	async exec(binaryPath, args, opts = {}) {
		log.info(`Running: ${binaryPath} ${args.join(" ")}`);
		const timeout = opts.timeout ?? this._timeout;

		try {
			const { stdout, stderr } = await execFileAsync(binaryPath, args, {
				maxBuffer: this._maxBuffer,
				timeout,
				killSignal: "SIGTERM",
			});

			if (stderr) {
				log.debug(`Command stderr (may be informational): ${stderr.trim()}`);
			}
			if (stdout) {
				log.debug(`Command stdout: ${stdout.trim()}`);
			}

			return { stdout, stderr };
		} catch (error) {
			if (error.killed && error.signal) {
				const timeoutError = new Error(
					`Command timed out after ${Math.round(timeout / 1000)}s: ${binaryPath}`
				);
				log.error(timeoutError.message);
				throw timeoutError;
			}

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
