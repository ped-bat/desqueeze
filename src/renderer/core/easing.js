/**
 * Pure math helpers for the dot-grid engine.
 * No DOM, no state — safe to unit test.
 */

export const lerp = (a, b, t) => a + (b - a) * t;

/** Smoothstep 0→1 */
export const sstep = (t) => t * t * (3 - 2 * t);

/** Factory: returns a cubic-bezier easing function */
export function makeBezier(p1x, p1y, p2x, p2y) {
	return (t) => {
		let u = t;
		for (let i = 0; i < 8; i++) {
			const x = 3 * (1 - u) * (1 - u) * u * p1x + 3 * (1 - u) * u * u * p2x + u * u * u - t;
			const dx = 3 * (1 - u) * (1 - u) * p1x + 6 * (1 - u) * u * (p2x - p1x) + 3 * u * u * (1 - p2x);
			if (Math.abs(dx) < 1e-6) break;
			u = Math.max(0, Math.min(1, u - x / dx));
		}
		return 3 * (1 - u) * (1 - u) * u * p1y + 3 * (1 - u) * u * u * p2y + u * u * u;
	};
}

export const decayEasing = makeBezier(0.33, 0, 0.66, 1);

/**
 * Advance a spring one step. Mutates s. Returns true if settled.
 * @param {{pos: number, vel: number}} s
 * @param {{stiffness: number, damping: number}} cfg
 * @param {number} dt seconds
 */
export function stepSpring(s, cfg, dt) {
	s.vel += (-cfg.stiffness * s.pos - cfg.damping * s.vel) * dt;
	s.pos += s.vel * dt;
	if (Math.abs(s.pos) < 0.001 && Math.abs(s.vel) < 0.01) {
		s.pos = 0;
		s.vel = 0;
		return true;
	}
	return false;
}

/**
 * Sample a spotlight gradient at normalized distance t (0=center, 1=edge).
 * @param {number} t
 * @param {Array<[number, number]>} gradient [position%, opacity%] stops
 */
export function sampleGradient(t, gradient) {
	const pts = gradient;
	const pct = t * 100;
	if (pct <= pts[0][0]) return pts[0][1] / 100;
	if (pct >= pts[pts.length - 1][0]) return pts[pts.length - 1][1] / 100;
	for (let i = 0; i < pts.length - 1; i++) {
		const [p0, o0] = pts[i];
		const [p1, o1] = pts[i + 1];
		if (pct >= p0 && pct <= p1) return lerp(o0, o1, sstep((pct - p0) / (p1 - p0))) / 100;
	}
	return 0;
}
