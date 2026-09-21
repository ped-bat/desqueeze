import { describe, it, expect, vi } from "vitest";
import { DngOperations } from "../../src/main/processors/dng-operations.js";

vi.mock("../../src/main/logger.js", () => ({
	default: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

/** An exiftool stand-in that answers read() per path and records write() */
function fakeExif(byPath) {
	return {
		read: vi.fn(async (p) => byPath[p] ?? {}),
		write: vi.fn(async () => {}),
	};
}

const SOURCE = "/in/_DSC3247.ARW";
const DNG = "/out/_DSC3247-desqueezed.dng";
const SONY_ARW = { Make: "SONY", Model: "ILCE-7CM2", WB_RGGBLevels: "2572 1024 1024 1584" };
const LINEAR_RAW = 34892;
const CFA = 32803;

/** A DNG as exiftool -G1 -a -n reports it: raw in SubIFD, thumbnail in IFD0 */
const dngTags = (neutral, photometric, make = "Sony") => ({
	"IFD0:Make": make,
	"IFD0:PhotometricInterpretation": 2,
	"SubIFD:PhotometricInterpretation": photometric,
	"SubIFD1:PhotometricInterpretation": 6,
	"IFD0:AsShotNeutral": neutral,
});

describe("DngOperations.repairWhiteBalance", () => {
	it("declares the camera gains as AnalogBalance on Sony's pre-balanced linear data (the ILCE-7CM2 case)", async () => {
		const exif = fakeExif({ [DNG]: dngTags("1 1 1", LINEAR_RAW), [SOURCE]: SONY_ARW });
		const ops = new DngOperations({ exifToolService: exif, commandRunner: {} });

		await expect(ops.repairWhiteBalance(SOURCE, DNG)).resolves.toBe("analog-balance");

		expect(exif.write).toHaveBeenCalledTimes(1);
		const [path, tags, args] = exif.write.mock.calls[0];
		expect(path).toBe(DNG);
		// 2572/1024 and 1584/1024; the neutral stays what the data says
		expect(tags).toEqual({ AsShotNeutral: "1 1 1", AnalogBalance: "2.511719 1 1.546875" });
		expect(args).toContain("-overwrite_original");
	});

	it("writes the camera-space neutral on Bayer data, where 1 1 1 is a placeholder", async () => {
		const exif = fakeExif({ [DNG]: dngTags("1 1 1", CFA), [SOURCE]: SONY_ARW });
		const ops = new DngOperations({ exifToolService: exif, commandRunner: {} });

		await expect(ops.repairWhiteBalance(SOURCE, DNG)).resolves.toBe("neutral");

		const [, tags] = exif.write.mock.calls[0];
		expect(tags).toEqual({ AsShotNeutral: "0.398134 1 0.646465" });
	});

	it("finds the raw IFD wherever it is", async () => {
		// dnglab's thumbnail-less layout: raw in IFD0
		const exif = fakeExif({
			[DNG]: { "IFD0:Make": "Sony", "IFD0:PhotometricInterpretation": CFA, "IFD0:AsShotNeutral": "1 1 1" },
			[SOURCE]: SONY_ARW,
		});
		const ops = new DngOperations({ exifToolService: exif, commandRunner: {} });
		await expect(ops.repairWhiteBalance(SOURCE, DNG)).resolves.toBe("neutral");
	});

	it("leaves a neutral DNGLab did read alone, without touching the source", async () => {
		const exif = fakeExif({ [DNG]: dngTags("0.45 1 0.7", CFA), [SOURCE]: SONY_ARW });
		const ops = new DngOperations({ exifToolService: exif, commandRunner: {} });

		await expect(ops.repairWhiteBalance(SOURCE, DNG)).resolves.toBe("kept");
		expect(exif.write).not.toHaveBeenCalled();
		expect(exif.read).toHaveBeenCalledTimes(1);
	});

	it("keeps the placeholder when the source has no readable white balance", async () => {
		const exif = fakeExif({ [DNG]: dngTags("1 1 1", CFA), [SOURCE]: { Make: "Unknown" } });
		const ops = new DngOperations({ exifToolService: exif, commandRunner: {} });

		await expect(ops.repairWhiteBalance(SOURCE, DNG)).resolves.toBe("kept");
		expect(exif.write).not.toHaveBeenCalled();
	});

	it("does not guess for linear data from a make whose pipeline it has not seen", async () => {
		const exif = fakeExif({
			[DNG]: dngTags("1 1 1", LINEAR_RAW, "Canon"),
			[SOURCE]: { Make: "Canon", WB_RGGBLevelsAsShot: "2000 1000 1000 1500" },
		});
		const ops = new DngOperations({ exifToolService: exif, commandRunner: {} });

		await expect(ops.repairWhiteBalance(SOURCE, DNG)).resolves.toBe("kept");
		expect(exif.write).not.toHaveBeenCalled();
	});
});
