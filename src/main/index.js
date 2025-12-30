import { app, BrowserWindow } from "electron";
import path from "path";
import { exiftool } from "exiftool-vendored";
import { registerIpcHandlers } from "./ipc.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Suppress Chromium DevTools warnings (Autofill API not available in Electron)
app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");

// Keep a global reference of the window object
let win;

function createWindow() {
	win = new BrowserWindow({
		frame: true,
		width: 800,
		height: 600,
		backgroundColor: "#000000",
		show: false,
		webPreferences: {
			preload: path.join(__dirname, "../preload/index.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	win.once("ready-to-show", () => {
		win.show();
	});

	// Load the renderer HTML (electron-vite handles dev vs prod)
	if (process.env.NODE_ENV === "development") {
		win.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		win.loadFile(path.join(__dirname, "../renderer/index.html"));
	}

	// Open DevTools for debugging (Cmd+Option+I to open manually)
	if (process.env.NODE_ENV === "development") {
		win.webContents.openDevTools();
	}

	win.on("closed", () => {
		win = null;
	});

	// Register IPC handlers after window is created
	registerIpcHandlers(win);
}

// App lifecycle events
app.on("ready", createWindow);

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});

app.on("activate", () => {
	if (win === null) {
		createWindow();
	}
});

app.on("quit", async () => {
	await exiftool.end();
});
