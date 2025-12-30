const { contextBridge, ipcRenderer } = require("electron");

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld("api", {
	selectImageFile: () => ipcRenderer.invoke("select-image-file"),
	desqueezeFile: (filePath) => ipcRenderer.invoke("desqueeze-file", filePath),
});
