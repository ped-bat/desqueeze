/**
 * Thin wrapper over the preload bridge (window.api).
 * Keeps components/store free of direct window.api references so the
 * surface is mockable in tests.
 */

const api = () => window.api;

export const ipc = {
	getConfig: () => api().getConfig(),
	selectImageFile: () => api().selectImageFile(),
	desqueezeFile: (filePath, ratioX, ratioY, outputOpts) =>
		api().desqueezeFile(filePath, ratioX, ratioY, outputOpts),
	showErrorDialog: (title, message) => api().showErrorDialog(title, message),
	expandDroppedPaths: (paths) => api().expandDroppedPaths(paths),
	filterDesqueezed: (paths) => api().filterDesqueezed(paths),
	getPathForFile: (file) => api().getPathForFile(file),
	showInFolder: (filePath) => api().showInFolder(filePath),
	cancelProcessing: () => api().cancelProcessing(),
	onProcessingProgress: (callback) => api().onProcessingProgress(callback),
};
