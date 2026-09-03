const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("api", {
	getConfig: () => ipcRenderer.invoke("get-config"),
	selectImageFile: () => ipcRenderer.invoke("select-image-file"),
	desqueezeFile: (filePath, ratioX, ratioY, outputOpts) =>
		ipcRenderer.invoke("desqueeze-file", filePath, ratioX, ratioY, outputOpts),
	showErrorDialog: (title, message) =>
		ipcRenderer.invoke("show-error-dialog", title, message),
	getPathForFile: (file) => webUtils.getPathForFile(file),
	expandDroppedPaths: (paths) =>
		ipcRenderer.invoke("expand-dropped-paths", paths),
	filterDesqueezed: (paths) => ipcRenderer.invoke("filter-desqueezed", paths),
	showInFolder: (filePath) => ipcRenderer.invoke("show-in-folder", filePath),
	cancelProcessing: () => ipcRenderer.invoke("cancel-processing"),
	saveErrorLog: (batch) => ipcRenderer.invoke("save-error-log", batch),
	onProcessingProgress: (callback) => {
		const listener = (_event, payload) => callback(payload);
		ipcRenderer.on("processing-progress", listener);
		return () => ipcRenderer.removeListener("processing-progress", listener);
	},
});
