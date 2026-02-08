import { describe, it, expect } from "vitest";
import { validateFilePath, validateRatios } from "../../src/main/utils/validation.js";

describe("Validation Utils", () => {
	describe("validateFilePath", () => {
		it("should pass for valid strings", () => {
			expect(() => validateFilePath("/path/to/image.jpg")).not.toThrow();
		});

		it("should throw for empty strings", () => {
			expect(() => validateFilePath("")).toThrow("File path must be a non-empty string.");
		});

		it("should throw for non-string types", () => {
			expect(() => validateFilePath(null)).toThrow("File path must be a non-empty string.");
			expect(() => validateFilePath(123)).toThrow("File path must be a non-empty string.");
		});
	});

	describe("validateRatios", () => {
		it("should pass for valid positive numbers", () => {
			expect(() => validateRatios(1.33, 1)).not.toThrow();
			expect(() => validateRatios(2, 1)).not.toThrow();
		});

		it("should throw for non-positive numbers", () => {
			expect(() => validateRatios(0, 1)).toThrow(/Invalid horizontal ratio/);
			expect(() => validateRatios(-1.33, 1)).toThrow(/Invalid horizontal ratio/);
			expect(() => validateRatios(1.33, 0)).toThrow(/Invalid vertical ratio/);
		});

		it("should throw for non-finite numbers", () => {
			expect(() => validateRatios(NaN, 1)).toThrow(/Invalid horizontal ratio/);
			expect(() => validateRatios(Infinity, 1)).toThrow(/Invalid horizontal ratio/);
		});

		it("should throw if stretch factor exceeds maximum", () => {
			// AppConfig.MAX_STRETCH_FACTOR is 5.0
			expect(() => validateRatios(6, 1)).toThrow(/exceeds maximum/);
		});
	});
});