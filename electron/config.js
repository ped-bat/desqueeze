// Supported RAW formats for DNG conversion
const RAW_FORMATS = new Set([
	".3fr",
	".ari",
	".arw",
	".cr2",
	".cr3",
	".crw",
	".dcr",
	".dcs",
	".dng",
	".erf",
	".iiq",
	".kdc",
	".mef",
	".mos",
	".mrw",
	".nef",
	".nrw",
	".orf",
	".pef",
	".raf",
	".raw",
	".rw2",
	".sr2",
	".srf",
	".srw",
]);

// Supported Bitmap formats for Sharp stretch conversion
const BITMAP_FORMATS = new Set([
	".jpg",
	".jpeg",
	".png",
	".tif",
	".tiff",
	".webp",
]);

// Aspect ratio values for desqueezing
const ratioX = 1.33;
const ratioY = 1;

module.exports = {
	RAW_FORMATS,
	BITMAP_FORMATS,
	ratioX,
	ratioY,
};
