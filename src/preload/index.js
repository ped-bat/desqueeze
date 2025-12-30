const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld("api", {
	selectImageFile: () => ipcRenderer.invoke("select-image-file"),
	desqueezeFile: (filePath, ratioX, ratioY) =>
		ipcRenderer.invoke("desqueeze-file", filePath, ratioX, ratioY),
	showErrorDialog: (title, message) =>
		ipcRenderer.invoke("show-error-dialog", title, message),
	playCompletionSound: () => ipcRenderer.invoke("play-completion-sound"),
});
