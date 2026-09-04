/*
 * Desqueeze landing page - page wiring.
 *
 * Owns: the background dot grid and where it looks, the hero's desqueeze
 * intro, scroll reveals, the platform-aware download button, and the
 * before/after photo.
 */

import { DotGrid } from "./dot-grid.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
   Background dot grid: fixed, ignoring the pointer, waving slowly the
   way the app's success state does, with smaller dots. Its focal point
   starts on the hero's title block and eases up to the top edge over the
   first 600px of scroll, then stays there.
   ───────────────────────────────────────────────────────────── */

const FOCUS_SCROLL = 600;

function initGrid(onFrame) {
	const canvas = document.getElementById("grid-canvas");
	if (!canvas || !canvas.getContext) return null;

	// Knocked back from the app's tuning: behind a page of prose the grid
	// is a backdrop, not the subject, so it never reaches full white.
	const grid = new DotGrid(canvas, {
		onFrame,
		config: {
			maxDotRadius: 1.1,
			wave: reduceMotion ? null : { period: 6, delay: 0, dark: 90, displacement: 4 },
			baseOpacity: 0.16,
			maxOpacity: 0.5,
			glowOpacity: 0.025,
			chromaOpacity: 0.45,
			grain: { intensity: 0.04 },
		},
	});
	const fit = () => grid.resize(window.innerWidth, window.innerHeight);
	fit();

	// Reduced motion still gets the grid, held still: no wave, no grain churn.
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

	// The pointer is deliberately not wired up: the grid is a fixed backdrop.

	document.addEventListener("visibilitychange", () => {
		if (document.hidden) grid.stop();
		else grid.start();
	});

	return grid;
}

/**
 * The focal point follows the page: on the title block at the top, then
 * up to the top edge as the first 600px scroll by, so the grid's centre
 * leaves with the hero rather than hanging mid-screen behind the prose.
 */
function initGridFocus(grid) {
	const head = document.getElementById("hero-heading");
	const download = document.querySelector(".download");
	if (!grid || !head) return;

	let blockY = 0.3; // fraction of the viewport height, at scroll 0

	const apply = () => {
		const t = clamp(window.scrollY / FOCUS_SCROLL, 0, 1);
		grid.setFocus(lerp(blockY, 0, t));
		if (reduceMotion) grid.renderOnce();
	};
	const measure = () => {
		const top = head.getBoundingClientRect().top + window.scrollY;
		const bottom = (download || head).getBoundingClientRect().bottom + window.scrollY;
		blockY = (top + bottom) / 2 / Math.max(window.innerHeight, 1);
		apply();
	};

	measure();
	window.addEventListener("resize", measure);
	window.addEventListener("scroll", apply, { passive: true });
}

/* ─────────────────────────────────────────────────────────────
   Hero: the wordmark arrives squeezed and desqueezes into its resting
   axes on the app's own text spring, with the RGB split riding the
   spring's velocity. Everything marked .reveal-load rises in on the same
   beat, once the variable font is in so nothing draws in a fallback face.
   ───────────────────────────────────────────────────────────── */

const TEXT_SPRING = { stiffness: 125, damping: 15 }; // config.js textSpring
const REST = { wght: 520, wdth: 125, track: 0.045 }; // config.js fontWeight/fontWidth rest
const SQUEEZED = { wght: 380, wdth: 58, track: -0.012 };

function initHero() {
	const title = document.getElementById("hero-heading");
	const layerR = title?.querySelector(".layer-r");
	const layerB = title?.querySelector(".layer-b");

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
		if (reduceMotion || !title) return;

		const spring = { value: 0, vel: 0 };
		const start = performance.now();
		let last = start;

		const settle = () => {
			title.style.fontVariationSettings = "";
			title.style.letterSpacing = "";
			applyChroma(0);
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
   Before and after: a diagonal split, bottom-left to top-right. The
   frame as shot sits above and left of it, the desqueezed frame below
   and right. On entry the split eases to the pointer on a spring, then
   tracks it directly, and stays wherever it was left. Touch drags it;
   the arrow keys move it for keyboard users.

   The split is k in [0, 2] on the family of lines x/W + y/H = k: 0 is
   the top-left corner, 1 the corner-to-corner diagonal, 2 the
   bottom-right corner.
   ───────────────────────────────────────────────────────────── */

// Stiff and close to critically damped, like the app's hover spring:
// quick, with just enough give to feel physical and almost no overshoot.
const SPLIT_SPRING = { stiffness: 170, damping: 24 };
const ENTRY_MS = 600; // after this the split tracks the pointer directly

function initCompare() {
	const el = document.getElementById("compare-view");
	const before = el?.querySelector(".compare-before");
	const line = el?.querySelector(".compare-line");
	const handle = el?.querySelector(".compare-handle");
	if (!el || !before || !line || !handle) return;

	const spring = { value: 1, vel: 0 };
	let target = 1;
	let raf = 0;
	let last = 0;
	let enteredAt = -Infinity;

	const pct = (v) => `${(v * 100).toFixed(2)}%`;
	const paint = (k) => {
		k = clamp(k, 0, 2);
		before.style.clipPath =
			k <= 1
				? `polygon(0 0, ${pct(k)} 0, 0 ${pct(k)})`
				: `polygon(0 0, 100% 0, 100% ${pct(k - 1)}, ${pct(k - 1)} 100%, 0 100%)`;
		// (kW/2, kH/2) lies on the line, and walks the other diagonal
		const c = pct(k / 2);
		line.style.left = c;
		line.style.top = c;
		handle.style.left = c;
		handle.style.top = c;
	};

	// The hairline turns to the box's own corner-to-corner angle
	const angle = () => {
		const r = el.getBoundingClientRect();
		if (r.width > 0) line.style.setProperty("--angle", `${((-Math.atan2(r.height, r.width) * 180) / Math.PI).toFixed(3)}deg`);
	};
	angle();
	window.addEventListener("resize", angle);
	paint(1);

	const snap = () => {
		if (raf) cancelAnimationFrame(raf);
		raf = 0;
		spring.value = target;
		spring.vel = 0;
		paint(target);
	};

	const frame = (now) => {
		// Clamped: a backgrounded tab can hand back a huge delta, and
		// integrating that in one step throws the spring across the photo.
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;
		const settled = stepSpringTo(spring, target, SPLIT_SPRING, dt);
		if (settled || now - enteredAt > ENTRY_MS) {
			snap();
			return;
		}
		paint(spring.value);
		raf = requestAnimationFrame(frame);
	};

	// Eased on entry; direct once the entry has landed
	const moveTo = (k, ease) => {
		target = clamp(k, 0, 2);
		const entering = ease && performance.now() - enteredAt <= ENTRY_MS;
		if (reduceMotion || !entering) {
			snap();
			return;
		}
		if (!raf) {
			last = performance.now();
			raf = requestAnimationFrame(frame);
		}
	};

	const kOf = (e) => {
		const r = el.getBoundingClientRect();
		if (r.width <= 0 || r.height <= 0) return target;
		return (e.clientX - r.left) / r.width + (e.clientY - r.top) / r.height;
	};

	el.addEventListener("pointerenter", (e) => {
		if (e.pointerType === "touch") return;
		enteredAt = performance.now();
		moveTo(kOf(e), true);
	});
	el.addEventListener("pointermove", (e) => {
		if (e.pointerType === "touch" && e.buttons === 0) return;
		moveTo(kOf(e), true);
	});
	el.addEventListener("pointerdown", (e) => moveTo(kOf(e), false));
	el.addEventListener("pointerleave", () => {
		enteredAt = -Infinity;
	});
	el.addEventListener("keydown", (e) => {
		const delta = { ArrowLeft: -0.1, ArrowUp: -0.1, ArrowRight: 0.1, ArrowDown: 0.1 }[e.key];
		if (delta === undefined) return;
		e.preventDefault();
		enteredAt = performance.now();
		moveTo(target + delta, true);
	});
}

/* ───────────────────────────────────────────────────────────── */

const grid = initGrid(null);
initGridFocus(grid);
initHero();
initReveals();
initDownloads();
initCompare();
