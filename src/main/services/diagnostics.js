/**
 * Diagnostics - builds a support log for a failed batch.
 *
 * The error state used to offer "Copy errors", which put one line per
 * failure on the clipboard. That is enough to see *that* something broke and
 * almost never enough to work out *why*: the reply is always a round trip
 * asking which version, which platform, which format, which factor, and what
 * the tool actually printed. This assembles all of that once, into a file the
 * user can attach to an email.
 *
 * Everything here is best-effort. A diagnostic report that throws while being
 * built is worse than one with "unavailable" in a field, so every lookup is
 * wrapped and failures are recorded in the report rather than raised.
 */

import { app, dialog, shell } from "electron";
import os from "os";
import fs from "fs/promises";
import path from "path";
import log from "../logger.js";
import { AppConfig } from "../config.js";
import { CommandRunner } from "./command-runner.js";

/** Tail of the rolling app log to embed. Enough to cover one batch. */
const LOG_TAIL_LINES = 400;

/** Cap on the embedded log, in case a single line is enormous. */
const LOG_TAIL_BYTES = 256 * 1024;

/** Wide enough that the longest label still leaves a gap before its value. */
const pad = (label) => String(label).padEnd(20);

const fmtBytes = (n) => {
	if (!Number.isFinite(n)) return "unknown";
	if (n < 1024) return `${n} B`;
	if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
	if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
	return `${(n / 1024 ** 3).toFixed(1)} GB`;
};

const fmtElapsed = (s) => {
	if (!Number.isFinite(s)) return "unknown";
	if (s < 1) return `${(s * 1000).toFixed(0)}ms`;
	if (s < 60) return `${s.toFixed(2)}s`;
	return `${Math.floor(s / 60)}m ${(s % 60).toFixed(0)}s`;
};

class Diagnostics {
	/**
	 * @param {Object} [deps]
	 * @param {import("./binary-resolver.js").BinaryResolver} [deps.binaryResolver]
	 * @param {CommandRunner} [deps.commandRunner]
	 */
	constructor(deps = {}) {
		this._resolver = deps.binaryResolver || null;
		this._runner = deps.commandRunner || new CommandRunner();
	}

	setBinaryResolver(resolver) {
		this._resolver = resolver;
	}

	/**
	 * Compose the report.
	 * @param {Object} batch - snapshot from the renderer
	 * @param {string} [batch.factorLabel]
	 * @param {number} [batch.factor]
	 * @param {string} [batch.format]
	 * @param {Object} [batch.formatOptions]
	 * @param {Object} [batch.result]
	 * @param {{name:string,path:string,status:string,error:string|null,
	 *          outputFile:string|null}[]} [batch.files]
	 * @returns {Promise<string>}
	 */
	async buildReport(batch = {}) {
		const files = Array.isArray(batch.files) ? batch.files : [];
		const sections = [
			this._header(),
			this._environment(),
			this._settings(batch),
			this._outcome(batch),
			await this._files(files),
			await this._binaries(),
			await this._appLog(),
		];
		return sections.join("\n") + "\n";
	}

	/**
	 * Ask where to put it, write it, then reveal it so the user has something
	 * to drag into a mail client rather than a path to go hunting for.
	 * @param {Object} batch
	 * @param {import("electron").BrowserWindow} [win]
	 * @returns {Promise<{saved:boolean, path?:string, error?:string}>}
	 */
	async saveReport(batch, win) {
		let text;
		try {
			text = await this.buildReport(batch);
		} catch (err) {
			log.error(`Failed to build diagnostic report: ${err.message}`);
			return { saved: false, error: err.message };
		}

		const stamp = new Date()
			.toISOString()
			.replace(/:/g, "-")
			.replace(/\..+$/, "");
		const defaultName = `desqueeze-log-${stamp}.txt`;

		const opts = {
			title: "Save error log",
			defaultPath: path.join(this._defaultDir(), defaultName),
			filters: [{ name: "Text log", extensions: ["txt"] }],
		};

		const result = win
			? await dialog.showSaveDialog(win, opts)
			: await dialog.showSaveDialog(opts);
		if (result.canceled || !result.filePath) return { saved: false };

		try {
			await fs.writeFile(result.filePath, text, "utf8");
		} catch (err) {
			log.error(`Failed to write diagnostic report: ${err.message}`);
			return { saved: false, error: err.message };
		}

		log.info(`Diagnostic report written to ${result.filePath}`);
		shell.showItemInFolder(result.filePath);
		return { saved: true, path: result.filePath };
	}

	_defaultDir() {
		for (const name of ["desktop", "downloads", "documents"]) {
			try {
				return app.getPath(name);
			} catch {
				// Not every platform defines every one of these
			}
		}
		return os.homedir();
	}

	_header() {
		return [
			"Desqueeze error log",
			"=".repeat(60),
			"",
			"This file describes one batch that did not fully succeed. It lists the",
			"files involved, including their full paths on this machine, so that",
			"whoever reads it can reproduce the failure.",
			"",
			`${pad("Generated")}${new Date().toISOString()}`,
			`${pad("Local time")}${new Date().toString()}`,
		].join("\n");
	}

	_environment() {
		const v = process.versions;
		return [
			"",
			"Environment",
			"-".repeat(60),
			`${pad("App version")}${this._safe(() => app.getVersion())}`,
			`${pad("Platform")}${process.platform} ${process.arch}`,
			`${pad("OS")}${this._safe(() => `${os.type()} ${os.release()}`)}`,
			`${pad("CPU cores")}${this._safe(() => os.cpus().length)}`,
			`${pad("Total memory")}${this._safe(() => fmtBytes(os.totalmem()))}`,
			`${pad("Free memory")}${this._safe(() => fmtBytes(os.freemem()))}`,
			`${pad("Electron")}${v.electron || "unknown"}`,
			`${pad("Chrome")}${v.chrome || "unknown"}`,
			`${pad("Node")}${v.node || "unknown"}`,
			`${pad("Packaged")}${this._safe(() => String(app.isPackaged))}`,
			`${pad("Concurrency")}${this._safe(() => AppConfig.MAX_CONCURRENCY)}`,
		].join("\n");
	}

	_settings(batch) {
		const opts = batch.formatOptions;
		return [
			"",
			"Settings used",
			"-".repeat(60),
			`${pad("Anamorphic factor")}${batch.factorLabel ?? batch.factor ?? "unknown"}`,
			`${pad("Output format")}${batch.format ?? "unknown"}`,
			`${pad("Format options")}${opts ? JSON.stringify(opts) : "none"}`,
		].join("\n");
	}

	_outcome(batch) {
		const r = batch.result || {};
		return [
			"",
			"Outcome",
			"-".repeat(60),
			`${pad("Files in batch")}${Array.isArray(batch.files) ? batch.files.length : 0}`,
			`${pad("Desqueezed")}${r.successCount ?? 0}`,
			`${pad("Failed")}${r.failedCount ?? 0}`,
			`${pad("Already desqueezed")}${r.skippedCount ?? 0}`,
			`${pad("Cancelled")}${r.cancelledCount ?? 0}`,
			`${pad("Elapsed")}${fmtElapsed(r.elapsed)}`,
		].join("\n");
	}

	/**
	 * Failures first: whoever opens this file is looking for them, and a long
	 * batch would otherwise bury one bad row under fifty good ones.
	 */
	async _files(files) {
		const rank = { failed: 0, cancelled: 1, skipped: 2, done: 3 };
		const ordered = [...files].sort(
			(a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9)
		);

		const lines = ["", "Files", "-".repeat(60)];
		if (ordered.length === 0) lines.push("(none)");

		for (const f of ordered) {
			lines.push(`[${String(f.status || "?").toUpperCase()}] ${f.name || "(unnamed)"}`);
			lines.push(`    ${pad("path")}${f.path || "unknown"}`);
			lines.push(`    ${pad("size")}${await this._sizeOf(f.path)}`);
			if (f.outputFile) lines.push(`    ${pad("output")}${f.outputFile}`);
			if (f.error) lines.push(`    ${pad("error")}${f.error}`);
			lines.push("");
		}
		return lines.join("\n").replace(/\n$/, "");
	}

	async _sizeOf(filePath) {
		if (!filePath) return "unknown";
		try {
			const st = await fs.stat(filePath);
			return fmtBytes(st.size);
		} catch (err) {
			// A file deleted or unmounted between the run and the report is
			// itself worth knowing about.
			return `unreadable (${err.code || err.message})`;
		}
	}

	async _binaries() {
		const lines = ["", "Bundled binaries", "-".repeat(60)];
		if (!this._resolver) {
			lines.push("(binary resolver unavailable)");
			return lines.join("\n");
		}

		const probes = [
			["DNGLab", () => this._resolver.getDNGLabPath(), ["--version"]],
			["dcraw_emu", () => this._resolver.getDcrawEmuPath(), null],
		];

		for (const [name, getPath, args] of probes) {
			let binPath;
			try {
				binPath = getPath();
			} catch (err) {
				lines.push(`${pad(name)}unresolved (${err.message})`);
				continue;
			}
			lines.push(`${pad(name)}${binPath}`);
			lines.push(`${pad("  present")}${await this._exists(binPath)}`);
			if (args) lines.push(`${pad("  version")}${await this._probe(binPath, args)}`);
		}

		lines.push(`${pad("ExifTool")}${await this._exiftoolVersion()}`);
		return lines.join("\n");
	}

	async _exists(p) {
		try {
			await fs.access(p);
			return "yes";
		} catch {
			return "NO - this is very likely the cause";
		}
	}

	async _probe(binPath, args) {
		try {
			const { stdout, stderr } = await this._runner.exec(binPath, args);
			return (stdout || stderr || "").trim().split("\n")[0] || "no output";
		} catch (err) {
			return `failed (${err.message})`;
		}
	}

	async _exiftoolVersion() {
		try {
			const { ExifToolService } = await import("./exiftool-service.js");
			const v = await ExifToolService.getInstance().version();
			return String(v);
		} catch (err) {
			return `unavailable (${err.message})`;
		}
	}

	/**
	 * The rolling electron-log file. This is where the command lines and the
	 * tools' own stderr end up, which is usually the part that actually
	 * explains a failure.
	 */
	async _appLog() {
		const lines = ["", `Application log (last ${LOG_TAIL_LINES} lines)`, "-".repeat(60)];
		let logPath;
		try {
			logPath = log.transports.file.getFile().path;
		} catch (err) {
			lines.push(`(log path unavailable: ${err.message})`);
			return lines.join("\n");
		}
		lines.push(`Source: ${logPath}`, "");

		try {
			const raw = await fs.readFile(logPath, "utf8");
			const tail = raw.split("\n").slice(-LOG_TAIL_LINES).join("\n");
			lines.push(
				tail.length > LOG_TAIL_BYTES
					? tail.slice(-LOG_TAIL_BYTES)
					: tail || "(log is empty)"
			);
		} catch (err) {
			lines.push(`(could not read log: ${err.message})`);
		}
		return lines.join("\n");
	}

	_safe(fn) {
		try {
			const v = fn();
			return v === undefined || v === null ? "unknown" : String(v);
		} catch {
			return "unknown";
		}
	}
}

export { Diagnostics };
