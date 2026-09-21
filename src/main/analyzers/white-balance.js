/**
 * Camera white balance → DNG colour tags.
 *
 * DNGLab writes AsShotNeutral as "1 1 1" when its decoder has no
 * white-balance coefficients for a file. What that means depends on the
 * data it wrote:
 *
 *  - Bayer (CFA) data is in camera space, so "1 1 1" is a placeholder for a
 *    neutral it did not know. The camera's multipliers m = [mR, mG, mB] make
 *    a neutral patch neutral, so that patch's raw values are ∝ 1/m and
 *    AsShotNeutral = [mG/mR, 1, mG/mB].
 *
 *  - Sony's lossless "M"/"S" sizes are stored demosaiced AND white-balanced
 *    (measured: a neutral patch reads R ≈ G ≈ B), and DNGLab writes them as
 *    3-sample LinearRaw. There "1 1 1" is the truth about the data, and the
 *    tag that describes what happened is AnalogBalance — the gain already
 *    applied to each stored channel — which a raw editor folds into its
 *    colour transform so its As-Shot temperature and tint come out where the
 *    camera's did. Writing the camera-space neutral instead applies the
 *    gains a second time and the image goes magenta.
 *
 * Both tags are derived from the same multipliers, which the source file
 * still carries in its maker notes and exiftool reads.
 */

/** Parse a space/comma-separated tag value (or array) into finite numbers */
export function parseNumbers(value) {
	if (value == null) return [];
	const parts = Array.isArray(value) ? value : String(value).trim().split(/[\s,]+/);
	return parts.map(Number).filter((n) => Number.isFinite(n));
}

/**
 * Is a DNG's AsShotNeutral the value DNGLab writes when it knows no white
 * balance? Missing, malformed, or all components equal.
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
 * The camera's white-balance gains, normalised to green: [mR/mG, 1, mB/mG].
 * This is the AnalogBalance of data the camera has already balanced.
 * @param {Record<string, unknown>} tags - exiftool's read() of the source
 * @returns {[number, number, number] | null}
 */
export function gainsFromWbTags(tags) {
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

	const gains = [mR / mG, 1, mB / mG];
	// Real gains sit within a few stops of green either way; anything
	// outside that is a misread tag, and writing it would be worse than
	// leaving the placeholder.
	if (!gains.every((v) => v >= 0.05 && v <= 20)) return null;
	return gains;
}

/**
 * The camera-space neutral implied by the gains: the AsShotNeutral of data
 * the camera has NOT balanced.
 * @param {[number, number, number]} gains - from gainsFromWbTags
 * @returns {[number, number, number]}
 */
export function neutralFromGains(gains) {
	return [1 / gains[0], 1, 1 / gains[2]];
}

/** Convenience: AsShotNeutral straight from the source's tags, or null */
export function neutralFromWbTags(tags) {
	const gains = gainsFromWbTags(tags);
	return gains ? neutralFromGains(gains) : null;
}

/** Format a triplet the way exiftool expects a rational tag: "r g b" */
export function formatTriplet(values) {
	return values.map((v) => Number(v.toFixed(6))).join(" ");
}
