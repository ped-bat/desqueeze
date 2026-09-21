import { describe, it, expect } from "vitest";
import {
	parseNumbers,
	isPlaceholderNeutral,
	neutralFromWbTags,
	formatNeutral,
} from "../../src/main/analyzers/white-balance.js";

describe("isPlaceholderNeutral", () => {
	it("treats DNGLab's 1 1 1 as a placeholder", () => {
		expect(isPlaceholderNeutral("1 1 1")).toBe(true);
	});
	it("treats any all-equal neutral as a placeholder", () => {
		expect(isPlaceholderNeutral("0.5 0.5 0.5")).toBe(true);
		expect(isPlaceholderNeutral([2, 2, 2])).toBe(true);
	});
	it("treats missing or malformed values as placeholders", () => {
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

describe("neutralFromWbTags", () => {
	it("reconstructs a Sony neutral from WB_RGGBLevels (the ILCE-7CM2 case)", () => {
		// _DSC3247.ARW: 2572 1024 1024 1584 → 1024/2572, 1, 1024/1584
		const n = neutralFromWbTags({ WB_RGGBLevels: "2572 1024 1024 1584" });
		expect(n[0]).toBeCloseTo(0.398134, 5);
		expect(n[1]).toBe(1);
		expect(n[2]).toBeCloseTo(0.646465, 5);
	});

	it("prefers Canon's explicit as-shot set over the generic tag", () => {
		const n = neutralFromWbTags({
			WB_RGGBLevelsAsShot: "2000 1000 1000 1500",
			WB_RGGBLevels: "9999 1000 1000 9999",
		});
		expect(n).toEqual([0.5, 1, 1000 / 1500]);
	});

	it("reads three-value RGB levels", () => {
		expect(neutralFromWbTags({ WB_RGBLevels: "2.0 1.0 1.6" })).toEqual([0.5, 1, 1 / 1.6]);
	});

	it("reads Fujifilm's G R B order", () => {
		const n = neutralFromWbTags({ WB_GRBLevels: "302 566 404" });
		expect(n[0]).toBeCloseTo(302 / 566, 6);
		expect(n[2]).toBeCloseTo(302 / 404, 6);
	});

	it("reads Nikon's R B gains around 1.0", () => {
		expect(neutralFromWbTags({ WB_RBLevels: "2.14 1.34" })).toEqual([1 / 2.14, 1, 1 / 1.34]);
	});

	it("reads Olympus's R B levels around 256", () => {
		const n = neutralFromWbTags({ WB_RBLevels: "466 366" });
		expect(n[0]).toBeCloseTo(256 / 466, 6);
		expect(n[2]).toBeCloseTo(256 / 366, 6);
	});

	it("reads Panasonic's three separate tags", () => {
		expect(neutralFromWbTags({ WBRedLevel: 500, WBGreenLevel: 250, WBBlueLevel: 400 })).toEqual([0.5, 1, 0.625]);
	});

	it("accepts arrays as well as strings", () => {
		expect(neutralFromWbTags({ WB_RGBLevels: [2, 1, 4] })).toEqual([0.5, 1, 0.25]);
	});

	it("returns null when no white-balance tag is present", () => {
		expect(neutralFromWbTags({ Make: "SONY" })).toBeNull();
		expect(neutralFromWbTags(null)).toBeNull();
	});

	it("returns null for a tag whose values cannot be a neutral", () => {
		expect(neutralFromWbTags({ WB_RGGBLevels: "0 1024 1024 1584" })).toBeNull();
		expect(neutralFromWbTags({ WB_RGGBLevels: "1 1024 1024 1584" })).toBeNull(); // 1024x gain
		expect(neutralFromWbTags({ WB_RGGBLevels: "abc" })).toBeNull();
	});
});

describe("formatNeutral", () => {
	it("writes the tag as space-separated decimals", () => {
		expect(formatNeutral([1024 / 2572, 1, 1024 / 1584])).toBe("0.398134 1 0.646465");
	});
});

describe("parseNumbers", () => {
	it("splits on whitespace and commas and drops junk", () => {
		expect(parseNumbers("1, 2 3\t4")).toEqual([1, 2, 3, 4]);
		expect(parseNumbers("1 x 3")).toEqual([1, 3]);
		expect(parseNumbers(undefined)).toEqual([]);
	});
});
