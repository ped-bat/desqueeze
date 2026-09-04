/*
 * Desqueeze landing page - page wiring.
 *
 * Owns: the background dot grid, the hero's desqueeze intro, scroll
 * reveals, the platform-aware download button, and the before/after photo.
 */

import { DotGrid } from "./dot-grid.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lerp = (a, b, t) => a + (b - a) * t;

// Always open at the top: left on "auto", a webfont swapping in after the
// browser restores the previous offset nudges that position on every reload.
if ("scrollRestoration" in history) history.scrollRestoration = "manual";

/**
 * Advance a spring one step towards `target`. Mutates s; returns true once
 * settled. Same integrator as the app's core/easing.js.
 */
function stepSpringTo(s, target, cfg, dt) {
	const accel = -cfg.stiffness * (s.value - target) - cfg.damping * s.vel;
	s.vel += accel * dt;
	s.value += s.vel * dt;
	if (Math.abs(s.value - target) < 0.001 && Math.abs(s.vel) < 0.01) {
		s.value = target;
		s.vel = 0;
		return true;
	}
	return false;
}

/* ─────────────────────────────────────────────────────────────
   Background dot grid: fixed and centred in the viewport, running the
   app's processing-stage stretch on its 3s loop. It does not travel
   with the page or follow the pointer.
   ───────────────────────────────────────────────────────────── */

function initGrid(onFrame) {
	const canvas = document.getElementById("grid-canvas");
	if (!canvas || !canvas.getContext) return null;

	// Knocked back from the app's tuning: behind a page of prose the grid
	// is a backdrop, not the subject, so it never reaches full white.
	const grid = new DotGrid(canvas, {
		onFrame,
		config: {
			loop: !reduceMotion,
			baseOpacity: 0.16,
			maxOpacity: 0.5,
			glowOpacity: 0.025,
			chromaOpacity: 0.45,
			grain: { intensity: 0.04 },
		},
	});
	const fit = () => grid.resize(window.innerWidth, window.innerHeight);
	fit();

	// Reduced motion still gets the grid, held still: no cursor magnetism,
	// no stretch loop, no grain churn.
	if (reduceMotion) {
		grid.renderOnce();
		let staticTimer;
		window.addEventListener("resize", () => {
			clearTimeout(staticTimer);
			staticTimer = setTimeout(() => {
				fit();
				grid.renderOnce();
			}, 150);
		});
		return grid;
	}

	grid.start();

	let resizeTimer;
	window.addEventListener("resize", () => {
		clearTimeout(resizeTimer);
		resizeTimer = setTimeout(fit, 120);
	});

	// The pointer is deliberately not wired up: the grid is a fixed backdrop
	// here, with the ambient spotlight only, no magnetism.

	document.addEventListener("visibilitychange", () => {
		if (document.hidden) grid.stop();
		else grid.start();
	});

	return grid;
}

/* ─────────────────────────────────────────────────────────────
   Hero: the wordmark arrives squeezed and desqueezes into its resting
   axes on the app's own text spring, with the RGB split riding the
   spring's velocity. Everything marked .reveal-load fades in on the same
   beat, once the variable font is in so nothing draws in a fallback face.
   ───────────────────────────────────────────────────────────── */

const TEXT_SPRING = { stiffness: 125, damping: 15 }; // config.js textSpring
const REST = { wght: 520, wdth: 125, track: 0.045 }; // config.js fontWeight/fontWidth rest
const SQUEEZED = { wght: 380, wdth: 58, track: -0.012 };

function initHero(grid) {
	const title = document.getElementById("hero-heading");
	const layerR = title?.querySelector(".layer-r");
	const layerB = title?.querySelector(".layer-b");
	const state = { introDone: reduceMotion };

	const applyChroma = (px) => {
		if (!layerR || !layerB) return;
		if (px > 0.05) {
			layerR.style.transform = `translateX(${px.toFixed(2)}px)`;
			layerB.style.transform = `translateX(${(-px).toFixed(2)}px)`;
		} else if (layerR.style.transform) {
			layerR.style.transform = "";
			layerB.style.transform = "";
		}
	};

	const revealLoad = () => {
		document.querySelectorAll(".reveal-load").forEach((el) => {
			el.style.animationDelay = `${parseInt(el.dataset.revealDelay || "0", 10)}ms`;
			el.classList.add("is-revealed");
		});
	};

	const run = () => {
		revealLoad();
		if (reduceMotion || !title) {
			state.introDone = true;
			return;
		}

		const spring = { value: 0, vel: 0 };
		const start = performance.now();
		let last = start;

		// The grid stretches on the same beat, as it does when the app changes state
		if (grid) setTimeout(() => grid.pulse(), 180);

		const settle = () => {
			title.style.fontVariationSettings = "";
			title.style.letterSpacing = "";
			applyChroma(0);
			state.introDone = true;
		};

		const frame = (now) => {
			const dt = Math.min((now - last) / 1000, 0.05);
			last = now;
			const settled = stepSpringTo(spring, 1, TEXT_SPRING, dt);
			const v = spring.value;

			title.style.fontVariationSettings = `"wght" ${lerp(SQUEEZED.wght, REST.wght, v).toFixed(1)}, "wdth" ${lerp(SQUEEZED.wdth, REST.wdth, v).toFixed(1)}`;
			title.style.letterSpacing = `${lerp(SQUEEZED.track, REST.track, v).toFixed(4)}em`;
			// The split is strongest while the line is moving fastest
			applyChroma(Math.min(1, Math.abs(spring.vel) * 0.45) * 4);

			if (!settled && now - start < 3000) requestAnimationFrame(frame);
			else settle();
		};
		requestAnimationFrame(frame);
	};

	if (document.fonts?.load) {
		const timeout = new Promise((r) => setTimeout(r, 1200));
		Promise.race([document.fonts.load('520 60px "Science Gothic"'), timeout]).then(run, run);
	} else {
		run();
	}

	return { state, applyChroma };
}

/* ─────────────────────────────────────────────────────────────
   Scroll reveals: rows of elements arriving together are staggered
   a little, top to bottom.
   ───────────────────────────────────────────────────────────── */

function initReveals() {
	const targets = document.querySelectorAll(".reveal:not(.reveal-load)");
	const reveal = (el) => el.classList.add("is-revealed");

	if (reduceMotion || !("IntersectionObserver" in window)) {
		targets.forEach(reveal);
		return;
	}

	const ROW_BUCKET = 24;
	const STEP_MS = 50;
	const io = new IntersectionObserver(
		(entries) => {
			const hit = entries.filter((e) => e.isIntersecting);
			if (!hit.length) return;
			const buckets = hit
				.map((e) => ({ entry: e, bucket: Math.round(e.boundingClientRect.top / ROW_BUCKET) }))
				.sort((a, b) => a.bucket - b.bucket);
			let order = 0;
			let prev = null;
			for (const b of buckets) {
				if (prev !== null && b.bucket !== prev) order++;
				prev = b.bucket;
				b.entry.target.style.animationDelay = `${order * STEP_MS}ms`;
				reveal(b.entry.target);
				io.unobserve(b.entry.target);
			}
		},
		{ threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
	);
	targets.forEach((el) => io.observe(el));
}

/* ─────────────────────────────────────────────────────────────
   Primary download: the visitor's platform first
   ───────────────────────────────────────────────────────────── */

const SPRITE = "assets/icons.svg";
const OS = {
	macos: { label: "Download for macOS", icon: "i-apple" },
	windows: { label: "Download for Windows", icon: "i-windows" },
	linux: { label: "Download for Linux", icon: "i-linux" },
};

function detectOS() {
	const ua = (navigator.userAgent || "").toLowerCase();
	const platform = (navigator.platform || "").toLowerCase();
	if (/mac|iphone|ipad|ipod/.test(platform) || /mac os/.test(ua)) return "macos";
	if (/win/.test(platform) || /windows/.test(ua)) return "windows";
	if (/linux|x11/.test(platform) || /linux/.test(ua)) return "linux";
	return null;
}

function initDownloads() {
	const os = detectOS() || "macos";
	const primary = document.getElementById("primary-download");
	const label = document.getElementById("primary-download-label");
	const icon = document.getElementById("primary-download-icon");
	const alt = document.getElementById("download-alt");
	if (!primary || !label || !icon) return;

	const cfg = OS[os];
	primary.setAttribute("data-os", os);
	label.textContent = cfg.label;
	icon.querySelector("use")?.setAttribute("href", `${SPRITE}#${cfg.icon}`);

	if (alt) {
		const own = alt.querySelector(`a[data-os="${os}"]`);
		if (own) {
			own.hidden = true;
			// Drop one adjacent separator too, so the remaining two keep
			// exactly one dot between them.
			const next = own.nextElementSibling;
			const prev = own.previousElementSibling;
			const sep = next?.classList.contains("alt-sep") ? next : prev?.classList.contains("alt-sep") ? prev : null;
			if (sep) sep.hidden = true;
		}
	}
}

/* ─────────────────────────────────────────────────────────────
   Before and after: the split runs top to bottom and rides a spring
   towards the pointer, so it eases in when the pointer enters, follows
   it while it is over the photo, and stays wherever it was left. Touch
   drags it; the up and down arrow keys move it for keyboard users.
   ───────────────────────────────────────────────────────────── */

// Stiff and close to critically damped, like the app's hover spring:
// quick, with just enough give to feel physical and almost no overshoot.
const SPLIT_SPRING = { stiffness: 170, damping: 24 };

function initCompare() {
	const el = document.getElementById("compare-view");
	if (!el) return;

	const spring = { value: 50, vel: 0 };
	let target = 50;
	let raf = 0;
	let last = 0;

	const paint = (v) => el.style.setProperty("--split", `${Math.max(0, Math.min(100, v)).toFixed(2)}%`);

	const frame = (now) => {
		// Clamped: a backgrounded tab can hand back a huge delta, and
		// integrating that in one step throws the spring across the photo.
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;
		const settled = stepSpringTo(spring, target, SPLIT_SPRING, dt);
		paint(spring.value);
		raf = settled ? 0 : requestAnimationFrame(frame);
	};

	// Retargeting mid-flight keeps the spring's velocity, so a pointer that
	// changes direction never restarts a curve.
	const moveTo = (pct) => {
		target = Math.max(0, Math.min(100, pct));
		if (reduceMotion) {
			spring.value = target;
			spring.vel = 0;
			paint(target);
			return;
		}
		if (!raf) {
			last = performance.now();
			raf = requestAnimationFrame(frame);
		}
	};

	const fromEvent = (e) => {
		const r = el.getBoundingClientRect();
		if (r.height > 0) moveTo(((e.clientY - r.top) / r.height) * 100);
	};

	el.addEventListener("pointerenter", (e) => {
		if (e.pointerType !== "touch") fromEvent(e);
	});
	el.addEventListener("pointermove", (e) => {
		if (e.pointerType === "touch" && e.buttons === 0) return;
		fromEvent(e);
	});
	el.addEventListener("pointerdown", fromEvent);
	el.addEventListener("keydown", (e) => {
		if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
		e.preventDefault();
		moveTo(target + (e.key === "ArrowUp" ? -5 : 5));
	});
}

/* ───────────────────────────────────────────────────────────── */

const hero = { state: { introDone: reduceMotion }, applyChroma: () => {} };
const grid = initGrid((f) => {
	// The title's RGB split rides the grid's stretch spring, exactly as
	// dg-app bridges onFrame into <dg-chroma-text>. The intro owns the
	// layers until it has settled.
	if (hero.state.introDone) hero.applyChroma(f.chromaOffset * 2);
});
Object.assign(hero, initHero(grid));
initReveals();
initDownloads();
initCompare();
