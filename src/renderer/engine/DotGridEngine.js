import { lerp, sstep, decayEasing, stepSpring, sampleGradient } from "../core/easing.js";
import { ENGINE_CONFIG, MODE_PARAMS, CURSOR_MODE, STRETCH_MODE } from "../core/config.js";

/**
 * DotGridEngine — canvas-only renderer for the magnetic dot grid.
 *
 * Owns its canvas and offscreen buffers; never touches DOM outside them.
 * Text/overlay animation values are emitted once per frame through
 * `onFrame(frameState)` so components can apply them to their own DOM.
 *
 * @typedef {Object} FrameState
 * @property {{opacity:number, wght:number, wdth:number, letterSpacing:number, chromaOffset:number}} title
 * @property {{opacity:number, wght:number, wdth:number, letterSpacing:number, chromaOffset:number, intensity:number}} subtitle
 * @property {{opacity:number, wght:number, wdth:number, letterSpacing:number, scaleX:number}} actions
 *
 * Callbacks:
 * - onFrame(frameState)  — every frame
 * - onSwap(mode)         — at the transition midpoint, when displayed content
 *                          should switch to the new mode's text/actions
 */
export class DotGridEngine {
	/**
	 * @param {HTMLCanvasElement} canvas
	 * @param {{onFrame?: Function, onSwap?: Function, config?: object, modeParams?: object}} [opts]
	 */
	constructor(canvas, opts = {}) {
		this.canvas = canvas;
		this.ctx = canvas.getContext("2d");
		this.onFrame = opts.onFrame || null;
		this.onSwap = opts.onSwap || null;
		this.C = opts.config || ENGINE_CONFIG;
		this.modes = opts.modeParams || MODE_PARAMS;

		this.offscreen = document.createElement("canvas");
		this.offCtx = this.offscreen.getContext("2d");
		this.maskCanvas = document.createElement("canvas");
		this.maskCtx = this.maskCanvas.getContext("2d");
		this.grainCanvas = document.createElement("canvas");
		this.grainCtx = this.grainCanvas.getContext("2d");
		this.grainData = null;

		this.mode = CURSOR_MODE;
		this.prevMode = null;
		this.modeT = 1;
		this.swapped = true;

		this.mouse = { x: -9999, y: -9999 };
		this.smoothMouse = { x: -9999, y: -9999 };
		this.mouseActive = false;
		this.cursorIntensity = 0;

		this.dots = [];
		this.cols = 0;
		this.rows = 0;
		this.lastTime = 0;

		// Stretch loop (processing)
		this.loopTimer = 0;
		this.phase = "stretch"; // 'stretch' | 'spring' | 'idle'
		this.stretchTimer = 0;
		this.gridSpring = { pos: 0, vel: 0 };
		this.textSpring = { pos: 0, vel: 0 };

		// Wave (error/success) + convergence (settings) timers
		this.waveTimer = 0;
		this.convergenceTimer = 0;

		this._raf = null;
		this._boundDraw = (now) => this._draw(now);
	}

	// ── Public API ──────────────────────────────────────────────

	start() {
		if (this._raf) return;
		this.lastTime = performance.now();
		this._raf = requestAnimationFrame(this._boundDraw);
	}

	stop() {
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = null;
	}

	/** @param {number} w @param {number} h CSS pixel size of the canvas */
	resize(w, h) {
		this.canvas.width = this.offscreen.width = this.maskCanvas.width = w;
		this.canvas.height = this.offscreen.height = this.maskCanvas.height = h;
		const gs = this.C.grain.size || 1;
		this.grainCanvas.width = Math.ceil(w / gs);
		this.grainCanvas.height = Math.ceil(h / gs);
		this.grainData = this.grainCtx.createImageData(this.grainCanvas.width, this.grainCanvas.height);
		this.canvas.style.width = w + "px";
		this.canvas.style.height = h + "px";
		this._buildGrid();
	}

	/** Switch mode with a rippled crossfade. */
	setMode(m) {
		if (m === this.mode || !this.modes[m]) return;
		this.prevMode = this.mode;
		this.mode = m;
		this.modeT = 0;
		this.swapped = false;

		if (m === STRETCH_MODE) {
			this.loopTimer = 0;
			this.phase = "stretch";
			this.stretchTimer = 0;
			this.gridSpring.pos = this.gridSpring.vel = 0;
			this.textSpring.pos = this.textSpring.vel = 0;
		}
		if (this.modes[m].waveDarkColor) this.waveTimer = 0;
		if (this.modes[m].convergenceDuration) this.convergenceTimer = 0;
	}

	setPointer(x, y) {
		this.mouse.x = x;
		this.mouse.y = y;
		this.mouseActive = true;
	}

	clearPointer() {
		this.mouseActive = false;
	}

	// ── Grid ────────────────────────────────────────────────────

	_buildGrid() {
		const C = this.C;
		this.dots = [];
		this.cols = Math.ceil(this.canvas.width / C.dotSpacing) + 1;
		this.rows = Math.ceil(this.canvas.height / C.dotSpacing) + 1;
		const ox = (this.canvas.width - (this.cols - 1) * C.dotSpacing) / 2;
		const oy = (this.canvas.height - (this.rows - 1) * C.dotSpacing) / 2;
		for (let r = 0; r < this.rows; r++)
			for (let c = 0; c < this.cols; c++)
				this.dots.push({
					x: ox + c * C.dotSpacing,
					y: oy + r * C.dotSpacing,
					col: c,
					row: r,
					ox: 0,
					oy: 0,
				});
	}

	// ── Main loop ───────────────────────────────────────────────

	_draw(now) {
		const C = this.C;
		const dt = Math.min((now - this.lastTime) / 1000, 0.05);
		this.lastTime = now;
		const w = this.canvas.width;
		const h = this.canvas.height;
		this.ctx.clearRect(0, 0, w, h);

		// Advance transition (modeT covers the full ripple duration)
		const totalTransition = Math.max(
			C.transitionDuration,
			C.rippleDelay + C.colorRippleDuration + C.rippleWidth
		);
		if (this.modeT < 1) {
			this.modeT = Math.min(this.modeT + dt / totalTransition, 1);
			// Swap displayed content early (at midpoint of the base transition)
			const textMid = (C.transitionDuration * 0.5) / totalTransition;
			if (!this.swapped && this.modeT >= textMid) {
				this.swapped = true;
				if (this.onSwap) this.onSwap(this.mode);
			}
		}

		const transitioning = this.modeT < 1 && this.prevMode !== null;
		// Weights use front-loaded progress (complete within transitionDuration)
		const weightT = Math.min((this.modeT * totalTransition) / C.transitionDuration, 1);
		const eased = sstep(weightT);

		const isCursorMode = (m) => m === CURSOR_MODE;
		const isStretchMode = (m) => m === STRETCH_MODE;
		// Mode-owned displacements (settings' convergence pull, error/success'
		// wave). Without a weight these are gated on the current mode alone, so
		// leaving the mode drops them to zero in a single frame — the grid
		// visibly jumps. Weighted, they release over the crossfade instead.
		const hasConvergence = (m) => !!this.modes[m]?.convergenceDuration;
		const hasWave = (m) => !!this.modes[m]?.waveDarkColor;

		let cursorW, stretchW, convergenceW, waveW, titleOpacity, subOpacity;
		if (transitioning) {
			cursorW = lerp(isCursorMode(this.prevMode) ? 1 : 0, isCursorMode(this.mode) ? 1 : 0, eased);
			stretchW = lerp(isStretchMode(this.prevMode) ? 1 : 0, isStretchMode(this.mode) ? 1 : 0, eased);
			convergenceW = lerp(hasConvergence(this.prevMode) ? 1 : 0, hasConvergence(this.mode) ? 1 : 0, eased);
			waveW = lerp(hasWave(this.prevMode) ? 1 : 0, hasWave(this.mode) ? 1 : 0, eased);
			// Title: fade out first half, fade in second half
			titleOpacity = weightT < 0.5 ? 1 - weightT / 0.5 : (weightT - 0.5) / 0.5;
			// Subtitle/actions: fast fade out (first 35%), smooth fade in (remaining 65%)
			const subFadeOutEnd = 0.35;
			if (weightT < subFadeOutEnd) {
				subOpacity = 1 - weightT / subFadeOutEnd;
			} else {
				subOpacity = (weightT - subFadeOutEnd) / (1 - subFadeOutEnd);
				subOpacity = sstep(subOpacity);
			}
		} else {
			this.prevMode = null;
			cursorW = isCursorMode(this.mode) ? 1 : 0;
			stretchW = isStretchMode(this.mode) ? 1 : 0;
			convergenceW = hasConvergence(this.mode) ? 1 : 0;
			waveW = hasWave(this.mode) ? 1 : 0;
			titleOpacity = 1;
			subOpacity = 1;
		}

		const frame = this._drawGrid(dt, cursorW, stretchW, convergenceW, waveW);
		this._drawGrain(w, h);
		this._drawCRT(w, h);

		frame.title.opacity = titleOpacity;
		frame.subtitle.opacity = subOpacity;
		frame.actions.opacity = subOpacity;
		if (this.onFrame) this.onFrame(frame);

		this._raf = requestAnimationFrame(this._boundDraw);
	}

	// ── Grid rendering ──────────────────────────────────────────

	/** @returns {FrameState} text animation values for this frame */
	_drawGrid(dt, cursorW, stretchW, convergenceW, waveW) {
		const C = this.C;
		const w = this.canvas.width;
		const h = this.canvas.height;
		const cx = w / 2;
		const cy = h / 2;
		const centerW = 1 - cursorW; // center-based spotlight weight
		const offCtx = this.offCtx;

		// Base dot colors for prev and current mode
		const prevMC = this.modes[this.prevMode || this.mode] || {};
		const currMC = this.modes[this.mode] || {};
		const [prR, prG, prB] = prevMC.dotColor || [255, 255, 255];
		const [cuR, cuG, cuB] = currMC.dotColor || [255, 255, 255];
		const globalColorT = sstep(this.modeT);

		// Which mode owns each timed effect. During a transition that is still
		// the mode being left, so its animation keeps playing while
		// convergenceW/waveW ease it out — reading these off the current mode
		// alone is what made the grid snap the instant the mode changed.
		const convMC = currMC.convergenceDuration ? currMC : prevMC.convergenceDuration ? prevMC : null;
		const waveMC = currMC.waveDarkColor ? currMC : prevMC.waveDarkColor ? prevMC : null;

		// Wave timer (error/success)
		if (waveMC?.waveDelay !== undefined) this.waveTimer += dt;

		// Convergence (settings) pull
		let convergencePullT = 0;
		if (convMC) {
			this.convergenceTimer += dt;
			if (convMC.convergenceEasing === "ease-in-out") {
				const raw = (this.convergenceTimer % convMC.convergenceDuration) / convMC.convergenceDuration;
				convergencePullT = sstep((1 - Math.cos(raw * Math.PI * 2)) * 0.5);
			} else {
				convergencePullT =
					(1 - Math.cos((this.convergenceTimer * Math.PI * 2) / convMC.convergenceDuration)) * 0.5;
			}
		}
		// Constant for the whole frame: the fraction of its distance from
		// center each dot is pulled in by, eased out by convergenceW on exit.
		const convergencePull = convMC ? convMC.convergenceAmount * convergencePullT * convergenceW : 0;

		// Animated spotlight gradient (transition between modes)
		let activeGradient = null;
		const prevGrad = prevMC.spotlightGradientTarget || C.spotlightGradient;
		const currGrad = currMC.spotlightGradientTarget || C.spotlightGradient;
		if (prevGrad !== currGrad || globalColorT < 1) {
			activeGradient = C.spotlightGradient.map((_, i) => [
				lerp(prevGrad[i][0], currGrad[i][0], globalColorT),
				lerp(prevGrad[i][1], currGrad[i][1], globalColorT),
			]);
		} else if (currMC.spotlightGradientTarget) {
			activeGradient = currMC.spotlightGradientTarget;
		}

		const maxDist = Math.sqrt(cx * cx + cy * cy);

		// Cursor tracking
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

		// Stretch loop phase machine (always runs; only visible when stretchW > 0)
		this.loopTimer += dt;
		if (this.loopTimer >= C.loopDuration) {
			this.loopTimer = 0;
			this.phase = "stretch";
			this.stretchTimer = 0;
			this.gridSpring.pos = this.gridSpring.vel = 0;
			this.textSpring.pos = this.textSpring.vel = 0;
		}
		if (this.phase === "stretch") {
			this.stretchTimer += dt;
			const progress = Math.min(this.stretchTimer / C.stretchDuration, 1);
			const se = 1 - Math.pow(1 - progress, 3);
			this.gridSpring.pos = this.textSpring.pos = se * C.stretchAmount;
			if (progress >= 1) {
				this.phase = "spring";
				this.gridSpring.pos = this.textSpring.pos = C.stretchAmount;
				this.gridSpring.vel = this.textSpring.vel = 0;
			}
		} else if (this.phase === "spring") {
			const gs = stepSpring(this.gridSpring, C.gridSpring, dt);
			const ts = stepSpring(this.textSpring, C.textSpring, dt);
			if (gs && ts) this.phase = "idle";
		}

		// ── Text animation values (emitted, not applied) ──
		const fontT = this.textSpring.pos / C.stretchAmount;
		const animWght = lerp(C.fontWeight.rest, C.fontWeight.stretch, fontT);
		const animWdth = lerp(C.fontWidth.rest, C.fontWidth.stretch, fontT);
		const animLS = lerp(C.letterSpacing.rest, C.letterSpacing.stretch, fontT);
		const titleWght = Math.max(100, Math.min(900, lerp(C.fontWeight.rest, animWght, stretchW)));
		const titleWdth = Math.max(50, Math.min(200, lerp(C.fontWidth.rest, animWdth, stretchW)));
		const titleLS = lerp(C.letterSpacing.rest, animLS, stretchW);
		const textChromaT = Math.min(Math.abs(this.textSpring.pos) / C.stretchAmount, 1);
		const titleChromaOff = C.textChromaStrength * textChromaT * stretchW;

		const subAnimWght = lerp(C.subFontWeight.rest, C.subFontWeight.stretch, fontT);
		const subAnimWdth = lerp(C.subFontWidth.rest, C.subFontWidth.stretch, fontT);
		const subAnimLS = lerp(C.subLetterSpacing.rest, C.subLetterSpacing.stretch, fontT);
		const subWght = Math.max(100, Math.min(900, lerp(C.subFontWeight.rest, subAnimWght, stretchW)));
		const subWdth = Math.max(50, Math.min(200, lerp(C.subFontWidth.rest, subAnimWdth, stretchW)));
		const subLS = lerp(C.subLetterSpacing.rest, subAnimLS, stretchW);
		const subChromaOff = C.subChromaStrength * textChromaT * stretchW;
		const subIntensity = Math.min(textChromaT * stretchW, 1);

		const btnDamp = 0.6;
		const btnWght = C.subFontWeight.rest + (subWght - C.subFontWeight.rest) * btnDamp;
		const btnWdth = C.subFontWidth.rest + (subWdth - C.subFontWidth.rest) * btnDamp;
		const btnLS = C.subLetterSpacing.rest + (subLS - C.subLetterSpacing.rest) * btnDamp;
		const btnScaleX = 1 + ((btnWdth - C.subFontWidth.rest) / C.subFontWidth.rest) * 0.15;

		// ── Precompute ──
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

		// ── Render dots ──
		offCtx.clearRect(0, 0, w, h);

		for (let i = 0; i < this.dots.length; i++) {
			const dot = this.dots[i];

			// Cursor repulsion
			const dx = dot.x - smx;
			const dy = dot.y - smy;
			const dist = Math.sqrt(dx * dx + dy * dy);
			let tox = 0;
			let toy = 0;
			if (this.mouseActive && dist > 0.1 && dist < C.repulsionRadius) {
				const repT = 1 - dist / C.repulsionRadius;
				const push = C.repulsionStrength * repT * repT;
				tox = (dx / dist) * push;
				toy = (dy / dist) * push;
			}
			const oLerp = 1 - Math.exp(-C.easeInSpeed * dt);
			dot.ox += (tox - dot.ox) * oLerp;
			dot.oy += (toy - dot.oy) * oLerp;

			// Stretch + barrel displacement
			const rowNorm = centerRow > 0 ? Math.abs(dot.row - centerRow) / centerRow : 0;
			const rowDecay = lerp(C.rowStretch.center, C.rowStretch.edge, decayEasing(rowNorm));
			const colNorm = centerCol > 0 ? Math.abs(dot.col - centerCol) / centerCol : 0;
			const colDecay = lerp(C.colStretch.center, C.colStretch.edge, decayEasing(colNorm));
			const colOff = dot.col - centerCol;
			let animOffX = colOff * C.dotSpacing * this.gridSpring.pos * rowDecay * colDecay;
			let animOffY = 0;

			if (springT > 0.001) {
				const sx = dot.x + animOffX;
				const sy = dot.y;
				const bx = sx - cx;
				const by = sy - cy;
				const bd = Math.sqrt(bx * bx + by * by);
				if (bd > 0.1 && bd < bMax) {
					const d = 1 + C.barrelStrength * springT * (bd / bMax) * (bd / bMax);
					animOffX = cx + bx * d - dot.x;
					animOffY = cy + by * d - dot.y;
				}
			}

			// Blend final position
			let drawX = dot.x + dot.ox * cursorW + animOffX * stretchW;
			let drawY = dot.y + dot.oy * cursorW + animOffY * stretchW;

			// Per-dot color (staggered ripple from center)
			const ddx = dot.x - cx;
			const ddy = dot.y - cy;
			const dotDist = Math.sqrt(ddx * ddx + ddy * ddy);
			const distNorm = maxDist > 0 ? dotDist / maxDist : 0;
			const elapsed = this.modeT * (C.rippleDelay + C.colorRippleDuration + C.rippleWidth);
			const dotDelay = C.rippleDelay + distNorm * C.colorRippleDuration;
			const dotElapsed = Math.max(0, elapsed - dotDelay);
			const dotColorT = Math.min(dotElapsed / C.rippleWidth, 1);
			const dct = sstep(dotColorT);
			const rippleBulge =
				dotColorT > 0 && dotColorT < 1 ? Math.pow(Math.sin(dotColorT * Math.PI), C.rippleFalloff) : 0;
			let cr = Math.round(lerp(prR, cuR, dct));
			let cg = Math.round(lerp(prG, cuG, dct));
			let cb = Math.round(lerp(prB, cuB, dct));

			// Intro ripple tint (e.g. success: dots settle white, ripple front green)
			if (currMC.rippleColor && rippleBulge > 0) {
				cr = Math.round(lerp(cr, currMC.rippleColor[0], rippleBulge));
				cg = Math.round(lerp(cg, currMC.rippleColor[1], rippleBulge));
				cb = Math.round(lerp(cb, currMC.rippleColor[2], rippleBulge));
			}

			// Wave pulse (error/success). waveW scales colour and displacement
			// together so the pulse recedes over the crossfade on the way out.
			let waveT = 0;
			if (waveMC) {
				const waveAge = this.waveTimer - waveMC.waveDelay;
				if (waveAge > 0) {
					const dotWaveAge = waveAge - distNorm * waveMC.wavePeriod;
					if (dotWaveAge > 0) {
						waveT = (1 - Math.cos((dotWaveAge / waveMC.wavePeriod) * Math.PI * 2)) * 0.5 * waveW;
						cr = Math.round(lerp(cr, waveMC.waveDarkColor[0], waveT));
						cg = Math.round(lerp(cg, waveMC.waveDarkColor[1], waveT));
						cb = Math.round(lerp(cb, waveMC.waveDarkColor[2], waveT));
					}
				}
			}

			// Wave displacement (push dots radially outward)
			if (waveT > 0 && waveMC.waveDisplacement && dotDist > 0.1) {
				const pushAmt = waveMC.waveDisplacement * waveT;
				drawX += (ddx / dotDist) * pushAmt;
				drawY += (ddy / dotDist) * pushAmt;
			}

			// Convergence pull (settings — dots creep toward center)
			if (convergencePull !== 0) {
				drawX -= ddx * convergencePull;
				drawY -= ddy * convergencePull;
			}

			// Spotlight visibility (blend cursor + center spotlights)
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
				activeGradient || C.spotlightGradient
			);
			const vis = cursorVis * cursorW + animVis * centerW;

			// Dot radius (with ripple bulge)
			// Ride the same per-dot ripple as the colour above, from the mode
			// being left to the one arriving — anchoring the low end at the
			// default made the enlarged error/success dots snap back on exit.
			const modeMaxR = lerp(prevMC.maxDotRadius || C.maxDotRadius, currMC.maxDotRadius || C.maxDotRadius, dct);
			const effectiveMaxR = lerp(modeMaxR, C.rippleMaxDotRadius, rippleBulge);
			const dotRadius = lerp(C.minDotRadius, effectiveMaxR, vis);
			const dotOpacity = lerp(C.baseOpacity, 1, vis);

			// Chromatic aberration (blend cursor + stretch vectors)
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
			const acVx = (rdx / rd) * animCMag;
			const acVy = (rdy / rd) * animCMag;

			const chromaVecX = ccVx * cursorW + acVx * stretchW;
			const chromaVecY = ccVy * cursorW + acVy * stretchW;
			const chromaOff = Math.sqrt(chromaVecX * chromaVecX + chromaVecY * chromaVecY);
			const hasChroma = chromaOff > 0.1;
			let cnx = 0;
			let cny = 0;
			if (hasChroma) {
				cnx = chromaVecX / chromaOff;
				cny = chromaVecY / chromaOff;
			}

			// Glow
			if (vis > 0.01) {
				const gr = dotRadius * C.glowRadiusMult;
				if (hasChroma) {
					this._drawChannelGlow(offCtx, drawX, drawY, gr, vis, cnx, cny, chromaOff);
				} else {
					const gsx = C.glowAspect;
					offCtx.save();
					offCtx.translate(drawX, drawY);
					offCtx.scale(gsx, 1);
					const glow = offCtx.createRadialGradient(0, 0, 0, 0, 0, gr);
					glow.addColorStop(0, `rgba(${cr},${cg},${cb},${(C.glowOpacity * vis).toFixed(3)})`);
					glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
					offCtx.beginPath();
					offCtx.arc(0, 0, gr, 0, Math.PI * 2);
					offCtx.fillStyle = glow;
					offCtx.fill();
					offCtx.restore();
				}
			}

			// Dot
			if (hasChroma) {
				this._drawChannelDot(offCtx, drawX, drawY, dotRadius, dotOpacity, cnx, cny, chromaOff);
			} else {
				offCtx.beginPath();
				offCtx.arc(drawX, drawY, dotRadius, 0, Math.PI * 2);
				offCtx.fillStyle = `rgba(${cr},${cg},${cb},${dotOpacity})`;
				offCtx.fill();
			}
		}

		// Blur compositing (blended center, radii, amount)
		const blurCX = lerp(smx, cx, centerW);
		const blurCY = lerp(smy, cy, centerW);
		const blurAlpha = (hasCursor ? 0.7 : 0) * cursorW + springT * stretchW;
		const blurSRx = lerp(spotRxA, spotRxB, centerW);
		const blurSRy = lerp(spotRyA, spotRyB, centerW);
		const blurRange = lerp(spotRangeA, spotRangeB, centerW);
		this._compositeWithBlur(blurCX, blurCY, w, h, blurAlpha, blurSRx, blurSRy, blurRange, activeGradient);

		return {
			title: {
				opacity: 1,
				wght: titleWght,
				wdth: titleWdth,
				letterSpacing: titleLS,
				chromaOffset: titleChromaOff,
			},
			subtitle: {
				opacity: 1,
				wght: subWght,
				wdth: subWdth,
				letterSpacing: subLS,
				chromaOffset: subChromaOff,
				intensity: subIntensity,
			},
			actions: {
				opacity: 1,
				wght: btnWght,
				wdth: btnWdth,
				letterSpacing: btnLS,
				scaleX: btnScaleX,
			},
		};
	}

	// ── Rendering helpers ───────────────────────────────────────

	static CHROMA_CHANNELS = [
		[255, 0, 0, 1], // Red — outward
		[0, 80, 204, 0], // Blue — center
		[0, 200, 68, -1], // Green — inward
	];

	_drawChannelGlow(c, x, y, radius, vis, nx, ny, offset) {
		const opa = this.C.chromaGlowOpacity * vis;
		const sx = this.C.glowAspect;
		for (const [r, g, b, dir] of DotGridEngine.CHROMA_CHANNELS) {
			const px = x + nx * offset * dir;
			const py = y + ny * offset * dir;
			c.save();
			c.translate(px, py);
			c.scale(sx, 1);
			const grad = c.createRadialGradient(0, 0, 0, 0, 0, radius);
			grad.addColorStop(0, `rgba(${r},${g},${b},${opa.toFixed(3)})`);
			grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
			c.beginPath();
			c.arc(0, 0, radius, 0, Math.PI * 2);
			c.fillStyle = grad;
			c.fill();
			c.restore();
		}
	}

	_drawChannelDot(c, x, y, radius, opacity, nx, ny, offset) {
		// At offset=0 channels overlap perfectly → full opacity; as the split
		// grows, fade toward chromaOpacity so the channels look intentional
		const maxOff = this.C.chromaStrength;
		const splitT = maxOff > 0 ? Math.min(offset / maxOff, 1) : 0;
		const opa = opacity * lerp(1, this.C.chromaOpacity, splitT);
		c.globalCompositeOperation = "lighter";
		for (const [r, g, b, dir] of DotGridEngine.CHROMA_CHANNELS) {
			c.beginPath();
			c.arc(x + nx * offset * dir, y + ny * offset * dir, radius, 0, Math.PI * 2);
			c.fillStyle = `rgba(${r},${g},${b},${opa})`;
			c.fill();
		}
		c.globalCompositeOperation = "source-over";
	}

	_drawGrain(w, h) {
		const G = this.C.grain;
		if (G.intensity <= 0 || !this.grainData) return;
		const d = this.grainData.data;
		const len = d.length;
		for (let i = 0; i < len; i += 4) {
			const v = (Math.random() * 255) | 0;
			d[i] = d[i + 1] = d[i + 2] = v;
			d[i + 3] = 255;
		}
		this.grainCtx.putImageData(this.grainData, 0, 0);
		const ctx = this.ctx;
		ctx.save();
		ctx.globalAlpha = G.intensity;
		ctx.globalCompositeOperation = "overlay";
		ctx.imageSmoothingEnabled = false;
		ctx.drawImage(this.grainCanvas, 0, 0, w, h);
		ctx.restore();
	}

	_drawCRT(w, h) {
		const C = this.C.crt;
		const ctx = this.ctx;
		// Scanlines are a DOM overlay (see dg-canvas) — canvas handles
		// flicker, vignette, and edge-curvature shadows only.

		if (C.flickerAmount > 0) {
			const flick = (Math.random() - 0.5) * C.flickerAmount;
			ctx.save();
			ctx.globalCompositeOperation = flick > 0 ? "lighter" : "multiply";
			ctx.globalAlpha = Math.abs(flick);
			ctx.fillStyle = flick > 0 ? "#ffffff" : "#000000";
			ctx.fillRect(0, 0, w, h);
			ctx.restore();
		}

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
				// [x, y, w, h, gx0, gy0, gx1, gy1]
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

	_compositeWithBlur(blurCX, blurCY, w, h, blurAlpha, spotRx, spotRy, spotRange, gradient) {
		const C = this.C;
		const ctx = this.ctx;

		// Always draw sharp base
		ctx.drawImage(this.offscreen, 0, 0);

		if (C.blurMax <= 0 || blurAlpha <= 0.005) return;

		// Blurred layer
		ctx.save();
		ctx.globalAlpha = blurAlpha;
		ctx.filter = `blur(${C.blurMax}px)`;
		ctx.drawImage(this.offscreen, 0, 0);
		ctx.restore();

		// Spotlight mask: sharp dots masked by gradient
		const maskCtx = this.maskCtx;
		maskCtx.clearRect(0, 0, w, h);
		maskCtx.drawImage(this.offscreen, 0, 0);
		maskCtx.globalCompositeOperation = "destination-in";
		const maxR = Math.max(spotRx, spotRy) * spotRange;
		maskCtx.save();
		maskCtx.translate(blurCX, blurCY);
		maskCtx.scale(1, spotRx / spotRy);
		const grad = maskCtx.createRadialGradient(0, 0, 0, 0, 0, maxR);
		const gradPts = gradient || C.spotlightGradient;
		for (const [pos, opa] of gradPts)
			grad.addColorStop(Math.min(pos / 100, 1), `rgba(255,255,255,${opa / 100})`);
		maskCtx.fillStyle = grad;
		maskCtx.fillRect(-w, -h * (spotRy / spotRx), w * 2, h * 2 * (spotRy / spotRx));
		maskCtx.restore();
		maskCtx.globalCompositeOperation = "source-over";

		// Punch sharp focus through blur
		ctx.save();
		ctx.globalAlpha = blurAlpha;
		ctx.drawImage(this.maskCanvas, 0, 0);
		ctx.restore();
	}
}
