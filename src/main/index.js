/**
 * AppManager - Electron main process entry point
 *
 * Manages the application lifecycle: window creation, IPC registration,
 * service initialization, and graceful shutdown.
 */

import { app, BrowserWindow } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import log from "./logger.js";
import { BinaryResolver } from "./services/binary-resolver.js";
import { ExifToolService } from "./services/exiftool-service.js";
import { DesqueezeProcessor } from "./processors/desqueeze-processor.js";
import { IpcRegistry } from "./ipc/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Suppress Chromium DevTools warnings (Autofill API not available in Electron)
app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication,Autofill");

class AppManager {
	constructor() {
		this._win = null;
		this._processor = new DesqueezeProcessor();
	}

	/**
	 * Create the main browser window and wire up all services.
	 */
	createWindow() {
		// Frameless chrome with vibrancy is macOS-only; Windows/Linux get a
		// standard frame so the window still has close/minimize controls.
		const platformWindowOptions =
			process.platform === "darwin"
				? {
						titleBarStyle: "hiddenInset",
						trafficLightPosition: { x: 16, y: 16 },
						vibrancy: "under-window",
						visualEffectState: "active",
					}
				: {
						backgroundColor: "#101014",
					};

		this._win = new BrowserWindow({
			width: 1000,
			height: 500,
			minWidth: 720,
			minHeight: 420,
			center: true,
			show: false,
			...platformWindowOptions,
			webPreferences: {
				preload: path.join(__dirname, "../preload/index.js"),
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		this._win.once("ready-to-show", () => {
			this._win.show();
		});

		// The app loads only its own local UI — deny popups and navigation
		// (a file dropped outside the drop handler would otherwise navigate
		// the window to that file).
		this._win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
		this._win.webContents.on("will-navigate", (event) => event.preventDefault());

		// Load renderer (electron-vite sets ELECTRON_RENDERER_URL in dev)
		if (process.env.ELECTRON_RENDERER_URL) {
			this._win.loadURL(process.env.ELECTRON_RENDERER_URL);
			//this._win.webContents.openDevTools();
		} else {
			this._win.loadFile(path.join(__dirname, "../renderer/index.html"));
		}

		this._win.on("closed", () => {
			this._win = null;
		});

		// Initialize binary resolver now that app is ready
		const resolver = BinaryResolver.fromElectronApp(app);
		this._processor.setBinaryResolver(resolver);

		// Register IPC handlers. The resolver goes along so the diagnostic
		// report can name the bundled binaries and say whether they are there.
		const ipc = new IpcRegistry(this._win, this._processor, resolver);
		ipc.register();
	}

	/**
	 * Register all app lifecycle event handlers.
	 */
	start() {
		app.on("ready", () => this.createWindow());

		app.on("window-all-closed", () => {
			// Always quit — on macOS keeping the process alive with no window
			// just forces the user to Ctrl+C twice.
			app.quit();
		});

		app.on("activate", () => {
			if (this._win === null) {
				this.createWindow();
			}
		});

		// before-quit fires on the FIRST Ctrl+C / Cmd+Q. Electron does not
		// await async listeners, so prevent the quit, shut ExifTool down,
		// then quit for real — otherwise the perl process gets orphaned.
		let shutdownDone = false;
		app.on("before-quit", (event) => {
			if (shutdownDone) return;
			event.preventDefault();
			ExifToolService.getInstance()
				.shutdown()
				.finally(() => {
					shutdownDone = true;
					app.quit();
				});
		});

		// Last-resort handlers: log instead of silently dying. Per-file
		// errors are already caught in ProcessHandler; anything landing
		// here is a programming error worth having in the log file.
		process.on("unhandledRejection", (reason) => {
			log.error(`Unhandled rejection: ${reason?.stack || reason}`);
		});
		process.on("uncaughtException", (error) => {
			log.error(`Uncaught exception: ${error?.stack || error}`);
		});
	}
}

// Boot the application
const appManager = new AppManager();
appManager.start();
