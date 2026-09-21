/**
 * Camera white balance → DNG AsShotNeutral.
 *
 * DNGLab writes AsShotNeutral as "1 1 1" when its decoder has no
 * white-balance reader for a camera (seen on the Sony ILCE-7CM2). A raw
 * editor takes that literally — "the neutral the camera saw was equal
 * R = G = B" — and derives an As-Shot temperature and tint that are
 * nothing like the original's. The camera's own multipliers are still in
 * the source file's maker notes, which exiftool reads, so the neutral can
 * be reconstructed from them.
 *
 * A camera's WB multipliers m = [mR, mG, mB] are the gains that make a
 * neutral patch neutral. That patch's raw values are therefore proportional
 * to 1/m, and AsShotNeutral is that vector normalised to green:
 *
 *   AsShotNeutral = [mG/mR, 1, mG/mB]
 */

/** Parse a space/comma-separated tag value (or array) into finite numbers */
export function parseNumbers(value) {
	if (value == null) return [];
	const parts = Array.isArray(value) ? value : String(value).trim().split(/[\s,]+/);
	return parts.map(Number).filter((n) => Number.isFinite(n));
}

/**
 * Is a DNG's AsShotNeutral the placeholder DNGLab writes when it knows no
 * white balance? Missing, malformed, or all components equal.
 * @param {string|number[]|undefined} value
 */
export function isPlaceholderNeutral(value) {
	const n = parseNumbers(value);
	if (n.length < 3) return true;
	const [r, g, b] = n;
	if (r <= 0 || g <= 0 || b <= 0) return true;
	return Math.abs(r - g) < 1e-6 && Math.abs(g - b) < 1e-6;
}

/**
 * Multiplier readers, in order of preference. Each returns [mR, mG, mB] or
 * null. Tag names and value orders are exiftool's.
 */
const READERS = [
	// Canon: the as-shot set, explicitly. "R G G B".
	["WB_RGGBLevelsAsShot", (n) => (n.length >= 4 ? [n[0], (n[1] + n[2]) / 2, n[3]] : null)],
	// Sony, Canon, others: "R G G B".
	["WB_RGGBLevels", (n) => (n.length >= 4 ? [n[0], (n[1] + n[2]) / 2, n[3]] : null)],
	["WB_RGBLevelsAsShot", (n) => (n.length >= 3 ? [n[0], n[1], n[2]] : null)],
	// "R G B".
	["WB_RGBLevels", (n) => (n.length >= 3 ? [n[0], n[1], n[2]] : null)],
	// "G R B G" / "G R G B".
	["WB_GRBGLevels", (n) => (n.length >= 4 ? [n[1], (n[0] + n[3]) / 2, n[2]] : null)],
	["WB_GRGBLevels", (n) => (n.length >= 4 ? [n[1], (n[0] + n[2]) / 2, n[3]] : null)],
	// Fujifilm: "G R B".
	["WB_GRBLevels", (n) => (n.length >= 3 ? [n[1], n[0], n[2]] : null)],
	// Nikon writes "R B" (and sometimes "R B G G") as gains around 1.0;
	// Olympus writes "R B" as integers around 256. Green is 1 in both.
	[
		"WB_RBLevels",
		(n) => {
			if (n.length < 2) return null;
			const scale = Math.max(n[0], n[1]) > 16 ? 256 : 1;
			return [n[0] / scale, 1, n[1] / scale];
		},
	],
];

/**
 * Reconstruct AsShotNeutral from a source file's white-balance tags.
 * @param {Record<string, unknown>} tags - exiftool's read() of the source
 * @returns {[number, number, number] | null} normalised to green, or null
 */
export function neutralFromWbTags(tags) {
	if (!tags) return null;

	let m = null;
	for (const [tag, read] of READERS) {
		if (tags[tag] == null) continue;
		m = read(parseNumbers(tags[tag]));
		if (m) break;
	}
	// Panasonic keeps the three as separate tags.
	if (!m && tags.WBRedLevel != null && tags.WBGreenLevel != null && tags.WBBlueLevel != null) {
		m = [Number(tags.WBRedLevel), Number(tags.WBGreenLevel), Number(tags.WBBlueLevel)];
	}
	if (!m) return null;

	const [mR, mG, mB] = m;
	if (![mR, mG, mB].every((v) => Number.isFinite(v) && v > 0)) return null;

	const neutral = [mG / mR, 1, mG / mB];
	// A real neutral sits within a few stops of green either way; anything
	// outside that is a misread tag, and writing it would be worse than
	// leaving the placeholder.
	if (!neutral.every((v) => v >= 0.05 && v <= 20)) return null;
	return neutral;
}

/** Format a neutral the way exiftool expects the tag: "r g b" */
export function formatNeutral(neutral) {
	return neutral.map((v) => Number(v.toFixed(6))).join(" ");
}
