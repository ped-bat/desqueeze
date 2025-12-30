const { app, BrowserWindow } = require("electron");
const path = require("path");
const { exiftool } = require("exiftool-vendored");
const { registerIpcHandlers } = require("./electron/ipc");

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
			preload: path.join(__dirname, "electron/preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	win.once("ready-to-show", () => {
		win.show();
	});

	win.loadFile(path.join(__dirname, "index.html"));

	// Open DevTools for debugging (remove in production)
	win.webContents.openDevTools();

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
