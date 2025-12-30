// Supported RAW formats for DNG conversion
export const RAW_FORMATS = new Set([
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
export const BITMAP_FORMATS = new Set([
	".jpg",
	".jpeg",
	".png",
	".tif",
	".tiff",
	".webp",
]);

// Default aspect ratio values for desqueezing
export const DEFAULT_RATIO_X = 1.33;
export const DEFAULT_RATIO_Y = 1;

// Premium feature flag
export const PREMIUM = true;
