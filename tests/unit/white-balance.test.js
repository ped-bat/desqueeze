import { describe, it, expect } from "vitest";
import {
	parseNumbers,
	isPlaceholderNeutral,
	gainsFromWbTags,
	neutralFromGains,
	neutralFromWbTags,
	formatTriplet,
} from "../../src/main/analyzers/white-balance.js";

describe("isPlaceholderNeutral", () => {
	it("treats DNGLab's 1 1 1 as the no-white-balance value", () => {
		expect(isPlaceholderNeutral("1 1 1")).toBe(true);
	});
	it("treats any all-equal neutral the same", () => {
		expect(isPlaceholderNeutral("0.5 0.5 0.5")).toBe(true);
		expect(isPlaceholderNeutral([2, 2, 2])).toBe(true);
	});
	it("treats missing or malformed values the same", () => {
		expect(isPlaceholderNeutral(undefined)).toBe(true);
		expect(isPlaceholderNeutral("")).toBe(true);
		expect(isPlaceholderNeutral("1 1")).toBe(true);
		expect(isPlaceholderNeutral("0 1 1")).toBe(true);
	});
	it("accepts a real neutral", () => {
		expect(isPlaceholderNeutral("0.398134 1 0.646465")).toBe(false);
		expect(isPlaceholderNeutral([0.45, 1, 0.7])).toBe(false);
	});
});

describe("gainsFromWbTags", () => {
	it("normalises Sony's WB_RGGBLevels to green (the ILCE-7CM2 case)", () => {
		// _DSC3247.ARW: 2572 1024 1024 1584
		const g = gainsFromWbTags({ WB_RGGBLevels: "2572 1024 1024 1584" });
		expect(g[0]).toBeCloseTo(2.511719, 5);
		expect(g[1]).toBe(1);
		expect(g[2]).toBeCloseTo(1.546875, 5);
	});

	it("prefers Canon's explicit as-shot set over the generic tag", () => {
		const g = gainsFromWbTags({
			WB_RGGBLevelsAsShot: "2000 1000 1000 1500",
			WB_RGGBLevels: "9999 1000 1000 9999",
		});
		expect(g).toEqual([2, 1, 1.5]);
	});

	it("reads three-value RGB levels", () => {
		expect(gainsFromWbTags({ WB_RGBLevels: "2.0 1.0 1.6" })).toEqual([2, 1, 1.6]);
	});

	it("reads Fujifilm's G R B order", () => {
		const g = gainsFromWbTags({ WB_GRBLevels: "302 566 404" });
		expect(g[0]).toBeCloseTo(566 / 302, 6);
		expect(g[2]).toBeCloseTo(404 / 302, 6);
	});

	it("reads Nikon's R B gains around 1.0", () => {
		expect(gainsFromWbTags({ WB_RBLevels: "2.14 1.34" })).toEqual([2.14, 1, 1.34]);
	});

	it("reads Olympus's R B levels around 256", () => {
		const g = gainsFromWbTags({ WB_RBLevels: "466 366" });
		expect(g[0]).toBeCloseTo(466 / 256, 6);
		expect(g[2]).toBeCloseTo(366 / 256, 6);
	});

	it("reads Panasonic's three separate tags", () => {
		expect(gainsFromWbTags({ WBRedLevel: 500, WBGreenLevel: 250, WBBlueLevel: 400 })).toEqual([2, 1, 1.6]);
	});

	it("accepts arrays as well as strings", () => {
		expect(gainsFromWbTags({ WB_RGBLevels: [2, 1, 4] })).toEqual([2, 1, 4]);
	});

	it("returns null when no white-balance tag is present", () => {
		expect(gainsFromWbTags({ Make: "SONY" })).toBeNull();
		expect(gainsFromWbTags(null)).toBeNull();
	});

	it("returns null for values that cannot be gains", () => {
		expect(gainsFromWbTags({ WB_RGGBLevels: "0 1024 1024 1584" })).toBeNull();
		expect(gainsFromWbTags({ WB_RGGBLevels: "1 1024 1024 1584" })).toBeNull(); // 1/1024 gain
		expect(gainsFromWbTags({ WB_RGGBLevels: "abc" })).toBeNull();
	});
});

describe("neutralFromGains / neutralFromWbTags", () => {
	it("inverts the gains: the camera-space coordinates of a neutral", () => {
		expect(neutralFromGains([2, 1, 1.6])).toEqual([0.5, 1, 1 / 1.6]);
	});
	it("gives the ILCE-7CM2 neutral straight from the tags", () => {
		const n = neutralFromWbTags({ WB_RGGBLevels: "2572 1024 1024 1584" });
		expect(n[0]).toBeCloseTo(0.398134, 5);
		expect(n[2]).toBeCloseTo(0.646465, 5);
	});
	it("is null without tags", () => {
		expect(neutralFromWbTags({})).toBeNull();
	});
});

describe("formatTriplet", () => {
	it("writes space-separated decimals", () => {
		expect(formatTriplet([1024 / 2572, 1, 1024 / 1584])).toBe("0.398134 1 0.646465");
		expect(formatTriplet([2572 / 1024, 1, 1584 / 1024])).toBe("2.511719 1 1.546875");
	});
});

describe("parseNumbers", () => {
	it("splits on whitespace and commas and drops junk", () => {
		expect(parseNumbers("1, 2 3\t4")).toEqual([1, 2, 3, 4]);
		expect(parseNumbers("1 x 3")).toEqual([1, 3]);
		expect(parseNumbers(undefined)).toEqual([]);
	});
});
