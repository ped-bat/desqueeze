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
		this._win = new BrowserWindow({
			width: 1000,
			height: 500,
			minWidth: 720,
			minHeight: 420,
			center: true,
			titleBarStyle: "hiddenInset",
			trafficLightPosition: { x: 16, y: 16 },
			vibrancy: "under-window",
			visualEffectState: "active",
			show: false,
			webPreferences: {
				preload: path.join(__dirname, "../preload/index.js"),
				contextIsolation: true,
				nodeIntegration: false,
			},
		});

		this._win.once("ready-to-show", () => {
			this._win.show();
		});

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

		// Register IPC handlers
		const ipc = new IpcRegistry(this._win, this._processor);
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

		// before-quit fires on the FIRST Ctrl+C / Cmd+Q.
		// Shut down ExifTool here so the process can exit immediately.
		app.on("before-quit", async () => {
			await ExifToolService.getInstance().shutdown();
		});
	}
}

// Boot the application
const appManager = new AppManager();
appManager.start();
