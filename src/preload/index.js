const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("api", {
	selectImageFile: () => ipcRenderer.invoke("select-image-file"),
	desqueezeFile: (filePath, ratioX, ratioY, outputOpts) =>
		ipcRenderer.invoke("desqueeze-file", filePath, ratioX, ratioY, outputOpts),
	showErrorDialog: (title, message) =>
		ipcRenderer.invoke("show-error-dialog", title, message),
	getPathForFile: (file) => webUtils.getPathForFile(file),
	expandDroppedPaths: (paths) =>
		ipcRenderer.invoke("expand-dropped-paths", paths),
	filterDesqueezed: (paths) => ipcRenderer.invoke("filter-desqueezed", paths),
});
