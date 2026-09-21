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

describe("DngOperations.repairAsShotNeutral", () => {
	it("rebuilds the neutral from the source's white balance when DNGLab left 1 1 1", async () => {
		const exif = fakeExif({
			[DNG]: { AsShotNeutral: "1 1 1" },
			[SOURCE]: { Make: "SONY", Model: "ILCE-7CM2", WB_RGGBLevels: "2572 1024 1024 1584" },
		});
		const ops = new DngOperations({ exifToolService: exif, commandRunner: {} });

		await expect(ops.repairAsShotNeutral(SOURCE, DNG)).resolves.toBe(true);

		expect(exif.write).toHaveBeenCalledTimes(1);
		const [path, tags, args] = exif.write.mock.calls[0];
		expect(path).toBe(DNG);
		expect(tags).toEqual({ AsShotNeutral: "0.398134 1 0.646465" });
		expect(args).toContain("-overwrite_original");
	});

	it("leaves a neutral DNGLab did read alone, without touching the source", async () => {
		const exif = fakeExif({
			[DNG]: { AsShotNeutral: "0.45 1 0.7" },
			[SOURCE]: { WB_RGGBLevels: "2572 1024 1024 1584" },
		});
		const ops = new DngOperations({ exifToolService: exif, commandRunner: {} });

		await expect(ops.repairAsShotNeutral(SOURCE, DNG)).resolves.toBe(false);

		expect(exif.write).not.toHaveBeenCalled();
		expect(exif.read).toHaveBeenCalledTimes(1);
	});

	it("keeps the placeholder when the source has no readable white balance", async () => {
		const exif = fakeExif({
			[DNG]: { AsShotNeutral: "1 1 1" },
			[SOURCE]: { Make: "Unknown" },
		});
		const ops = new DngOperations({ exifToolService: exif, commandRunner: {} });

		await expect(ops.repairAsShotNeutral(SOURCE, DNG)).resolves.toBe(false);
		expect(exif.write).not.toHaveBeenCalled();
	});
});
