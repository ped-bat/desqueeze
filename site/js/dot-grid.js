/*
 * DotGrid — the landing-page port of the app's DotGridEngine
 * (src/renderer/engine/DotGridEngine.js).
 *
 * Same look, less machinery: the app's engine drives five lifecycle modes
 * (ready/settings/processing/error/success) with ripples, waves and springs.
 * The site only ever needs two of those behaviours, so this keeps
 *
 *   - the magnetic cursor (repulsion + smoothed follow + cursor spotlight)
 *   - the stretch pulse (the horizontal squeeze the app runs while working)
 *   - chromatic aberration on dots, film grain, vignette
 *
 * and drops the mode crossfade, colour ripple, error/success waves and the
 * blur compositing pass. Tuning values below are copied verbatim from
 * src/renderer/core/config.js so the two stay visually identical.
 */

const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (t) => t * t * (3 - 2 * t);

/** Cubic-bezier easing factory (Newton solve on x, same as the app's). */
function makeBezier(p1x, p1y, p2x, p2y) {
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

const decayEasing = makeBezier(0.33, 0, 0.66, 1);

/** Advance a spring one step. Mutates s; returns true once settled. */
function stepSpring(s, cfg, dt) {
	s.vel += (-cfg.stiffness * s.pos - cfg.damping * s.vel) * dt;
	s.pos += s.vel * dt;
	if (Math.abs(s.pos) < 0.001 && Math.abs(s.vel) < 0.01) {
		s.pos = 0;
		s.vel = 0;
		return true;
	}
	return false;
}

/** Sample a [position%, opacity%] spotlight gradient at normalized distance t. */
function sampleGradient(t, pts) {
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

export const CONFIG = {
	dotSpacing: 30,
	maxDotRadius: 1.5,
	minDotRadius: 0,
	baseOpacity: 0.5,
	glowRadiusMult: 6,
	glowAspect: 1.5,
	glowOpacity: 0.05,

	// Cursor magnetism
	easeInSpeed: 8,
	easeOutSpeed: 3,
	mouseFollowSpeed: 10,
	repulsionStrength: 50,
	repulsionRadius: 500,
	cursorSpotlight: { width: 0.2, height: 0.25, range: 5 },

	// Stretch pulse — the app runs this on a 3s loop while processing.
	// Here it fires on demand (hero intro, and when a section scrolls in).
	stretchAmount: 0.6,
	stretchDuration: 1.5,
	gridSpring: { stiffness: 125, damping: 15 },
	rowStretch: { center: 1, edge: 0.5 },
	colStretch: { center: 1, edge: 0 },

	// Ambient centre spotlight (what you see with no pointer)
	spotlightWidth: 0.25,
	spotlightHeight: 0.2,
	spotlightRange: 5,
	spotlightGradient: [
		[10, 0],
		[60, 100],
		[100, 0],
	],

	barrelStrength: 0.25,
	barrelRadius: 1,
	chromaStrength: 2,
	chromaOpacity: 0.7,

	crt: { vignetteStrength: 0.4, curvature: 0.02 },
	// The app also carries a `size` here; this port tiles baked noise instead
	// of generating it per pixel, so only the intensity still applies.
	grain: { intensity: 0.06 },
};

/** R/G/B channel offsets for the aberration split. */
const CHROMA_CHANNELS = [
	[255, 0, 0, 1],
	[0, 80, 204, 0],
	[0, 200, 68, -1],
];

export class DotGrid {
	/**
	 * @param {HTMLCanvasElement} canvas
	 * @param {{config?: object, onFrame?: (f: object) => void}} [opts]
	 */
	constructor(canvas, opts = {}) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.C = { ...CONFIG, ...(opts.config || {}) };
		this.onFrame = opts.onFrame || null;

		this.offscreen = document.createElement("canvas");
		this.offCtx = this.offscreen.getContext("2d");

		/*
		 * The app regenerates a full-canvas ImageData of noise every frame.
		 * That is affordable in a 1120x720 window and emphatically not in a
		 * full-bleed browser viewport — at 1710x958 it is ~6.5M random()
		 * calls per frame and it locks the main thread hard enough to stall
		 * CSS transitions. Instead: bake a handful of noise tiles once and
		 * cycle them under a random offset. Visually identical, O(1) a frame.
		 */
		this.grainTiles = [];
		this.grainPatterns = [];
		this.grainIndex = 0;

		// One white radial sprite stands in for the per-dot gradient the app
		// allocates on every dot of every frame.
		this.glowSprite = null;

		this.dpr = 1;
		this.w = 0;
		this.h = 0;
		this.mouse = { x: -9999, y: -9999 };
		this.smoothMouse = { x: -9999, y: -9999 };
		this.mouseActive = false;
		this.cursorIntensity = 0;

		this.dots = [];
		this.cols = 0;
		this.rows = 0;
		this.lastTime = 0;

		// Stretch pulse state
		this.phase = "idle"; // 'stretch' | 'spring' | 'idle'
		this.stretchTimer = 0;
		this.gridSpring = { pos: 0, vel: 0 };

		// Parallax: the grid drifts slightly as the page scrolls, so the
		// background reads as one continuous surface behind the sections.
		this.scrollOffset = 0;

		this.running = false;
		this._raf = null;
		this._boundDraw = (now) => this._draw(now);
	}

	start() {
		if (this.running) return;
		this.running = true;
		this.lastTime = performance.now();
		this._raf = requestAnimationFrame(this._boundDraw);
	}

	stop() {
		this.running = false;
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = null;
	}

	/**
	 * Draw a single settled frame without starting the loop — what
	 * prefers-reduced-motion visitors get instead of the animation.
	 */
	renderOnce() {
		this.lastTime = performance.now();
		this._draw(this.lastTime);
	}

	/** @param {number} w @param {number} h CSS pixels */
	resize(w, h) {
		// 1.5 is the ceiling worth paying for: the dots top out at 1.5px and
		// the whole thing is composited every frame, so full 2x doubles the
		// fill cost for detail nobody can see.
		const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		this.dpr = dpr;
		this.w = w;
		this.h = h;

		for (const c of [this.canvas, this.offscreen]) {
			c.width = Math.round(w * dpr);
			c.height = Math.round(h * dpr);
		}
		this.canvas.style.width = w + "px";
		this.canvas.style.height = h + "px";
		this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		this.offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

		if (!this.grainTiles.length) this._buildGrainTiles();
		if (!this.glowSprite) this._buildGlowSprite();

		this._buildGrid();
	}

	/** Bake the noise tiles the grain pass cycles through. Called once. */
	_buildGrainTiles() {
		const size = 128;
		const count = 4;
		this.grainTiles = [];
		this.grainPatterns = [];
		for (let i = 0; i < count; i++) {
			const c = document.createElement("canvas");
			c.width = c.height = size;
			const cx = c.getContext("2d");
			const img = cx.createImageData(size, size);
			const d = img.data;
			for (let p = 0; p < d.length; p += 4) {
				const v = (Math.random() * 255) | 0;
				d[p] = d[p + 1] = d[p + 2] = v;
				d[p + 3] = 255;
			}
			cx.putImageData(img, 0, 0);
			this.grainTiles.push(c);
			this.grainPatterns.push(this.ctx.createPattern(c, "repeat"));
		}
	}

	/** Bake the white radial the dot glow is drawn from. Called once. */
	_buildGlowSprite() {
		const size = 64;
		const c = document.createElement("canvas");
		c.width = c.height = size;
		const cx = c.getContext("2d");
		const r = size / 2;
		const g = cx.createRadialGradient(r, r, 0, r, r, r);
		g.addColorStop(0, "rgba(255,255,255,1)");
		g.addColorStop(1, "rgba(255,255,255,0)");
		cx.fillStyle = g;
		cx.fillRect(0, 0, size, size);
		this.glowSprite = c;
	}

	setPointer(x, y) {
		this.mouse.x = x;
		this.mouse.y = y;
		if (!this.mouseActive) {
			// First move: land the smoothed cursor on the pointer instead of
			// flying in from the off-screen sentinel.
			this.smoothMouse.x = x;
			this.smoothMouse.y = y;
		}
		this.mouseActive = true;
	}

	clearPointer() {
		this.mouseActive = false;
	}

	/** Fire the horizontal stretch-and-settle pulse. */
	pulse() {
		this.phase = "stretch";
		this.stretchTimer = 0;
		this.gridSpring.pos = 0;
		this.gridSpring.vel = 0;
	}

	setScrollOffset(px) {
		this.scrollOffset = px;
	}

	_buildGrid() {
		const C = this.C;
		this.dots = [];
		this.cols = Math.ceil(this.w / C.dotSpacing) + 1;
		this.rows = Math.ceil(this.h / C.dotSpacing) + 3; // + slack for scroll drift
		const ox = (this.w - (this.cols - 1) * C.dotSpacing) / 2;
		const oy = (this.h - (this.rows - 1) * C.dotSpacing) / 2;
		for (let r = 0; r < this.rows; r++) {
			for (let c = 0; c < this.cols; c++) {
				this.dots.push({ x: ox + c * C.dotSpacing, y: oy + r * C.dotSpacing, col: c, row: r, ox: 0, oy: 0 });
			}
		}
	}

	_draw(now) {
		const dt = Math.min((now - this.lastTime) / 1000, 0.05);
		this.lastTime = now;
		this.ctx.clearRect(0, 0, this.w, this.h);

		const frame = this._drawGrid(dt);
		this._drawGrain();
		this._drawVignette();

		if (this.onFrame) this.onFrame(frame);
		if (this.running) this._raf = requestAnimationFrame(this._boundDraw);
	}

	_drawGrid(dt) {
		const C = this.C;
		const w = this.w;
		const h = this.h;
		const cx = w / 2;
		const cy = h / 2;
		const offCtx = this.offCtx;

		// Cursor tracking (exponential smoothing, frame-rate independent)
		if (this.mouseActive) {
			const t = 1 - Math.exp(-C.mouseFollowSpeed * dt);
			this.smoothMouse.x += (this.mouse.x - this.smoothMouse.x) * t;
			this.smoothMouse.y += (this.mouse.y - this.smoothMouse.y) * t;
		}
		const ciTarget = this.mouseActive ? 1 : 0;
		const ciSpeed = this.mouseActive ? C.easeInSpeed : C.easeOutSpeed;
		this.cursorIntensity += (ciTarget - this.cursorIntensity) * (1 - Math.exp(-ciSpeed * dt));
		if (this.cursorIntensity < 0.001) this.cursorIntensity = 0;

		const smx = this.smoothMouse.x;
		const smy = this.smoothMouse.y;
		const hasCursor = this.cursorIntensity > 0;
		// Cursor spotlight takes over from the centre one as the pointer warms up
		const cursorW = this.cursorIntensity;
		const centerW = 1 - cursorW;

		// Stretch pulse phase machine
		if (this.phase === "stretch") {
			this.stretchTimer += dt;
			const progress = Math.min(this.stretchTimer / C.stretchDuration, 1);
			this.gridSpring.pos = (1 - Math.pow(1 - progress, 3)) * C.stretchAmount;
			if (progress >= 1) {
				this.phase = "spring";
				this.gridSpring.pos = C.stretchAmount;
				this.gridSpring.vel = 0;
			}
		} else if (this.phase === "spring") {
			if (stepSpring(this.gridSpring, C.gridSpring, dt)) this.phase = "idle";
		}

		const springT = Math.min(Math.abs(this.gridSpring.pos) / C.stretchAmount, 1);
		const bMax = Math.sqrt(cx * cx + cy * cy) * C.barrelRadius;
		const spotRxA = w * C.cursorSpotlight.width * 0.5;
		const spotRyA = h * C.cursorSpotlight.height * 0.5;
		const spotRangeA = C.cursorSpotlight.range;
		const spotRxB = w * C.spotlightWidth * 0.5;
		const spotRyB = h * C.spotlightHeight * 0.5;
		const spotRangeB = C.spotlightRange;
		const centerCol = (this.cols - 1) / 2;
		const centerRow = (this.rows - 1) / 2;
		const oLerp = 1 - Math.exp(-C.easeInSpeed * dt);

		// Grid drifts vertically with scroll, wrapping on dotSpacing so the
		// lattice never visibly restarts.
		const drift = -((this.scrollOffset * 0.12) % C.dotSpacing);

		offCtx.clearRect(0, 0, w, h);

		for (let i = 0; i < this.dots.length; i++) {
			const dot = this.dots[i];
			const baseX = dot.x;
			const baseY = dot.y + drift;

			// Cursor repulsion — quadratic falloff, pushed away from pointer
			const dx = baseX - smx;
			const dy = baseY - smy;
			const dist = Math.sqrt(dx * dx + dy * dy);
			let tox = 0;
			let toy = 0;
			if (this.mouseActive && dist > 0.1 && dist < C.repulsionRadius) {
				const repT = 1 - dist / C.repulsionRadius;
				const push = C.repulsionStrength * repT * repT;
				tox = (dx / dist) * push;
				toy = (dy / dist) * push;
			}
			dot.ox += (tox - dot.ox) * oLerp;
			dot.oy += (toy - dot.oy) * oLerp;

			// Horizontal stretch, strongest at the centre row, decaying outward
			const rowNorm = centerRow > 0 ? Math.abs(dot.row - centerRow) / centerRow : 0;
			const rowDecay = lerp(C.rowStretch.center, C.rowStretch.edge, decayEasing(rowNorm));
			const colNorm = centerCol > 0 ? Math.abs(dot.col - centerCol) / centerCol : 0;
			const colDecay = lerp(C.colStretch.center, C.colStretch.edge, decayEasing(colNorm));
			const colOff = dot.col - centerCol;
			let animOffX = colOff * C.dotSpacing * this.gridSpring.pos * rowDecay * colDecay;
			let animOffY = 0;

			// Barrel distortion rides along with the stretch
			if (springT > 0.001) {
				const bx = baseX + animOffX - cx;
				const by = baseY - cy;
				const bd = Math.sqrt(bx * bx + by * by);
				if (bd > 0.1 && bd < bMax) {
					const d = 1 + C.barrelStrength * springT * (bd / bMax) * (bd / bMax);
					animOffX = cx + bx * d - baseX;
					animOffY = cy + by * d - baseY;
				}
			}

			const drawX = baseX + dot.ox * cursorW + animOffX;
			const drawY = baseY + dot.oy * cursorW + animOffY;

			// Spotlight visibility: cursor and centre spotlights, cross-faded
			const csdx = (drawX - smx) / spotRxA;
			const csdy = (drawY - smy) / spotRyA;
			const cursorVis = hasCursor
				? sampleGradient(Math.min(Math.sqrt(csdx * csdx + csdy * csdy) / spotRangeA, 1), C.spotlightGradient) *
					this.cursorIntensity
				: 0;
			const asdx = (drawX - cx) / spotRxB;
			const asdy = (drawY - cy) / spotRyB;
			const animVis = sampleGradient(
				Math.min(Math.sqrt(asdx * asdx + asdy * asdy) / spotRangeB, 1),
				C.spotlightGradient
			);
			const vis = cursorVis * cursorW + animVis * centerW;
			if (vis <= 0.01) continue;

			const dotRadius = lerp(C.minDotRadius, C.maxDotRadius, vis);
			const dotOpacity = lerp(C.baseOpacity, 1, vis);

			// Chromatic aberration vector: repulsion direction blended with
			// the radial stretch direction
			const repMag = Math.sqrt(dot.ox * dot.ox + dot.oy * dot.oy);
			const cursorCMag = C.chromaStrength * Math.min(repMag / C.repulsionStrength, 1);
			let ccVx = 0;
			let ccVy = 0;
			if (repMag > 0.1) {
				ccVx = (dot.ox / repMag) * cursorCMag;
				ccVy = (dot.oy / repMag) * cursorCMag;
			}
			const animCMag = C.chromaStrength * springT;
			const rdx = drawX - cx;
			const rdy = drawY - cy;
			const rd = Math.sqrt(rdx * rdx + rdy * rdy) || 1;
			const chromaVecX = ccVx * cursorW + (rdx / rd) * animCMag;
			const chromaVecY = ccVy * cursorW + (rdy / rd) * animCMag;
			const chromaOff = Math.sqrt(chromaVecX * chromaVecX + chromaVecY * chromaVecY);
			const hasChroma = chromaOff > 0.1;
			const cnx = hasChroma ? chromaVecX / chromaOff : 0;
			const cny = hasChroma ? chromaVecY / chromaOff : 0;

			// Glow — the baked radial, stretched anamorphically wide
			const gr = dotRadius * C.glowRadiusMult;
			const gw = gr * C.glowAspect;
			offCtx.globalAlpha = C.glowOpacity * vis;
			offCtx.drawImage(this.glowSprite, drawX - gw, drawY - gr, gw * 2, gr * 2);
			offCtx.globalAlpha = 1;

			if (hasChroma) {
				const splitT = Math.min(chromaOff / C.chromaStrength, 1);
				const opa = dotOpacity * lerp(1, C.chromaOpacity, splitT);
				offCtx.globalCompositeOperation = "lighter";
				for (const [r, g, b, dir] of CHROMA_CHANNELS) {
					offCtx.beginPath();
					offCtx.arc(drawX + cnx * chromaOff * dir, drawY + cny * chromaOff * dir, dotRadius, 0, Math.PI * 2);
					offCtx.fillStyle = `rgba(${r},${g},${b},${opa})`;
					offCtx.fill();
				}
				offCtx.globalCompositeOperation = "source-over";
			} else {
				offCtx.beginPath();
				offCtx.arc(drawX, drawY, dotRadius, 0, Math.PI * 2);
				offCtx.fillStyle = `rgba(255,255,255,${dotOpacity})`;
				offCtx.fill();
			}
		}

		this.ctx.drawImage(this.offscreen, 0, 0, w, h);

		// Font-axis values for the title, driven by the same spring the grid
		// uses — the app emits these through onFrame the same way.
		const t = this.gridSpring.pos / C.stretchAmount;
		return {
			stretchT: t,
			wght: lerp(300, 500, t),
			wdth: lerp(80, 100, t),
			letterSpacing: lerp(8, 12, t),
			chromaOffset: Math.min(Math.abs(t), 1),
		};
	}

	_drawGrain() {
		const G = this.C.grain;
		if (G.intensity <= 0 || !this.grainPatterns.length) return;

		// Cycle tile and jitter the origin so a 128px tile never reads as a
		// repeating texture — the eye only sees the noise churning.
		this.grainIndex = (this.grainIndex + 1) % this.grainPatterns.length;
		const pattern = this.grainPatterns[this.grainIndex];
		const ox = -Math.floor(Math.random() * 128);
		const oy = -Math.floor(Math.random() * 128);

		const ctx = this.ctx;
		ctx.save();
		ctx.globalAlpha = G.intensity;
		ctx.globalCompositeOperation = "overlay";
		ctx.translate(ox, oy);
		ctx.fillStyle = pattern;
		ctx.fillRect(0, 0, this.w - ox, this.h - oy);
		ctx.restore();
	}

	_drawVignette() {
		const C = this.C.crt;
		const ctx = this.ctx;
		const w = this.w;
		const h = this.h;
		if (C.vignetteStrength > 0) {
			const cx = w / 2;
			const cy = h / 2;
			const r = Math.sqrt(cx * cx + cy * cy);
			const vig = ctx.createRadialGradient(cx, cy, r * 0.4, cx, cy, r);
			vig.addColorStop(0, "rgba(0,0,0,0)");
			vig.addColorStop(1, `rgba(0,0,0,${C.vignetteStrength})`);
			ctx.fillStyle = vig;
			ctx.fillRect(0, 0, w, h);
		}
		if (C.curvature > 0) {
			const c = C.curvature;
			const edges = [
				[0, 0, w, h * c * 4, 0, 0, 0, h * c * 4],
				[0, h - h * c * 4, w, h * c * 4, 0, h, 0, h - h * c * 4],
				[0, 0, w * c * 4, h, 0, 0, w * c * 4, 0],
				[w - w * c * 4, 0, w * c * 4, h, w, 0, w - w * c * 4, 0],
			];
			for (const [x, y, ew, eh, gx0, gy0, gx1, gy1] of edges) {
				const grad = ctx.createLinearGradient(gx0, gy0, gx1, gy1);
				grad.addColorStop(0, `rgba(0,0,0,${c * 8})`);
				grad.addColorStop(1, "rgba(0,0,0,0)");
				ctx.fillStyle = grad;
				ctx.fillRect(x, y, ew, eh);
			}
		}
	}
}
