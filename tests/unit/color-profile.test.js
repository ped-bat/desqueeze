import { describe, it, expect, vi } from "vitest";
import { ColorProfile } from "../../src/main/analyzers/color-profile.js";

// Mock logger to avoid noise during tests
vi.mock("../../src/main/logger.js", () => ({
	default: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() },
}));

/** Build a ColorProfile from a profile description string */
function profileFor(description, { depth = "uchar", space = "rgb" } = {}) {
	return new ColorProfile({
		sharpMeta: { depth, space },
		iccProfile: description ? { description } : null,
		exifData: {},
	});
}

describe("ColorProfile", () => {
	it("resolves sRGB with dual illuminant (D65)", () => {
		const p = profileFor("sRGB IEC61966-2.1");
		expect(p.colorSpace.name).toBe("sRGB");
		expect(p.colorSpace.matrixBase).toBe("XYZ_sRGB");
		expect(p.illuminant).toBe("D65");
		expect(p.needsDualIlluminant).toBe(true);
	});

	it("resolves Adobe RGB with the AdobeRGB matrix family", () => {
		const p = profileFor("Adobe RGB (1998)");
		expect(p.colorSpace.name).toBe("Adobe RGB");
		expect(p.colorSpace.matrixBase).toBe("XYZ_AdobeRGB");
		expect(p.needsDualIlluminant).toBe(true);
	});

	it("approximates Display P3 with sRGB matrices (dnglab constraint)", () => {
		const p = profileFor("Display P3");
		expect(p.colorSpace.name).toBe("Display P3");
		expect(p.colorSpace.matrixBase).toBe("XYZ_sRGB");
		expect(p.needsDualIlluminant).toBe(true);
	});

	it("resolves ProPhoto RGB as single-illuminant D50 with a dnglab-supported matrix", () => {
		const p = profileFor("ProPhoto RGB");
		expect(p.colorSpace.name).toBe("ProPhoto RGB");
		expect(p.illuminant).toBe("D50");
		expect(p.needsDualIlluminant).toBe(false);
		// Must be one of dnglab's supported identifiers, not XYZ_ProPhoto_*
		expect(["XYZ_sRGB_D50", "XYZ_sRGB_D65", "XYZ_AdobeRGB_D50", "XYZ_AdobeRGB_D65"])
			.toContain(p.colorSpace.matrix);
	});

	it("falls back to assumed sRGB for unknown profiles", () => {
		const p = profileFor(null);
		expect(p.colorSpace.name).toBe("sRGB (assumed)");
		expect(p.colorSpace.matrixBase).toBe("XYZ_sRGB");
	});

	it("maps Sharp depth strings to bit prefixes", () => {
		expect(profileFor("sRGB", { depth: "uchar" }).colorDepth.prefix).toBe("8bit");
		expect(profileFor("sRGB", { depth: "ushort" }).colorDepth.prefix).toBe("16bit");
		expect(profileFor("sRGB", { depth: "unknown-depth" }).colorDepth.bits).toBe(8);
	});
});
