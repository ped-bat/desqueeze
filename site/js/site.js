/*
 * Desqueeze landing page - page wiring.
 *
 * Owns: the background dot grid, the hero's desqueeze intro, scroll
 * reveals, the platform-aware download button, the live version badge and
 * the batch that runs inside the rebuilt app window.
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
   Background dot grid
   ───────────────────────────────────────────────────────────── */

function initGrid(onFrame) {
	const canvas = document.getElementById("grid-canvas");
	if (!canvas || !canvas.getContext) return null;

	const grid = new DotGrid(canvas, { onFrame });
	const fit = () => grid.resize(window.innerWidth, window.innerHeight);
	fit();

	// Reduced motion still gets the grid, held still: no cursor magnetism,
	// no scroll drift, no grain churn.
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

	// Pointer drives the magnetic spotlight. Coarse pointers never fire
	// mousemove, so those visitors keep the ambient centre spotlight.
	window.addEventListener("mousemove", (e) => grid.setPointer(e.clientX, e.clientY), { passive: true });
	document.addEventListener("mouseleave", () => grid.clearPointer());

	document.addEventListener("visibilitychange", () => {
		if (document.hidden) grid.stop();
		else grid.start();
	});

	let ticking = false;
	window.addEventListener(
		"scroll",
		() => {
			if (ticking) return;
			ticking = true;
			requestAnimationFrame(() => {
				grid.setScrollOffset(window.scrollY);
				ticking = false;
			});
		},
		{ passive: true }
	);

	return grid;
}

/* ─────────────────────────────────────────────────────────────
   Hero: the display line arrives squeezed and desqueezes into its
   resting axes on the app's own text spring, with the RGB split riding
   the spring's velocity. Everything marked .reveal-load fades in on the
   same beat, once the variable font is in so nothing draws in a
   fallback face.
   ───────────────────────────────────────────────────────────── */

const TEXT_SPRING = { stiffness: 125, damping: 15 }; // config.js textSpring
const REST = { wght: 520, wdth: 125, track: 0.045 }; // config.js fontWeight/fontWidth rest
const SQUEEZED = { wght: 380, wdth: 58, track: -0.012 };

function initHero(grid) {
	const title = document.getElementById("hero-heading");
	const logo = document.querySelector(".hero-logo");
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

		// The grid pulses on the same beat, as it does when the app changes state
		if (grid) setTimeout(() => grid.pulse(), 180);

		const settle = () => {
			title.style.fontVariationSettings = "";
			title.style.letterSpacing = "";
			if (logo) logo.style.transform = "";
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
			if (logo) logo.style.transform = `scaleX(${lerp(0.55, 1, v).toFixed(4)})`;
			// The split is strongest while the line is moving fastest
			applyChroma(Math.min(1, Math.abs(spring.vel) * 0.45) * 6);

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
   Top bar: a firmer ground once prose scrolls under it
   ───────────────────────────────────────────────────────────── */

function initBar() {
	const bar = document.querySelector(".bar-top");
	if (!bar) return;
	const onScroll = () => bar.classList.toggle("stuck", window.scrollY > 40);
	onScroll();
	window.addEventListener("scroll", onScroll, { passive: true });
}

/* ─────────────────────────────────────────────────────────────
   Scroll reveals: rows of elements arriving together are staggered
   a little, top to bottom.
   ───────────────────────────────────────────────────────────── */

function initReveals(grid) {
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
				// A section title arriving pulses the grid, tying the background
				// to the reading position the way the app ties it to state.
				if (grid && b.entry.target.classList.contains("section-title")) grid.pulse();
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
   Version badge: the markup carries the version at deploy time; the
   latest release overrides it when GitHub answers, so it never goes stale.
   ───────────────────────────────────────────────────────────── */

async function initVersion() {
	const el = document.getElementById("version");
	if (!el) return;
	try {
		const res = await fetch("https://api.github.com/repos/ped-bat/desqueeze/releases/latest", {
			headers: { Accept: "application/vnd.github+json" },
		});
		if (!res.ok) return;
		const json = await res.json();
		const tag = typeof json.tag_name === "string" ? json.tag_name : "";
		if (/^v?\d+\.\d+\.\d+/.test(tag)) el.textContent = tag.startsWith("v") ? tag : `v${tag}`;
	} catch {
		/* offline, rate-limited or blocked: the deploy-time version stands */
	}
}

/* ─────────────────────────────────────────────────────────────
   The app, running a batch. Follows dg-app's modes: settings (files
   queued) → processing (three at a time, the chip stowed) → success
   (the summary and actions swap) → back to settings and round again.
   ───────────────────────────────────────────────────────────── */

const STATUS_LABEL = { queued: "Queued", running: "Converting", done: "Done" };
const CHECK =
	'<svg class="ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3.2 8.6l3.1 3.1 6.5-7" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const PARALLEL = 3;
const FACTOR = "1.33x";
const FORMAT = "DNG";

function initDemo() {
	const app = document.getElementById("app-demo");
	if (!app) return;
	const rows = Array.from(app.querySelectorAll(".row"));
	const chip = document.getElementById("demo-chip");
	const summary = document.getElementById("demo-summary");
	const actions = document.getElementById("demo-actions");
	if (!rows.length || !chip || !summary || !actions) return;
	const total = rows.length;

	const timers = new Set();
	const after = (ms, fn) => {
		const t = setTimeout(() => {
			timers.delete(t);
			fn();
		}, ms);
		timers.add(t);
	};
	const clearAll = () => {
		timers.forEach(clearTimeout);
		timers.clear();
	};

	const setRow = (row, status) => {
		row.className = `row ${status}`;
		const st = row.querySelector(".status");
		st.textContent = STATUS_LABEL[status];
		if (status === "done") st.insertAdjacentHTML("afterbegin", CHECK);
	};
	const btn = (label, role) => `<span class="btn btn-${role}">${label}</span>`;
	const time = (s) => (s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(2)}s`);

	const screens = {
		settings() {
			chip.classList.remove("stowed");
			rows.forEach((r) => setRow(r, "queued"));
			summary.innerHTML = `<span><b>${total} files</b> · ${FACTOR} · ${FORMAT}</span>`;
			actions.innerHTML = btn("Clear", "quiet") + btn("Desqueeze images", "primary");
		},
		processing() {
			chip.classList.add("stowed");
			summary.innerHTML = `<span class="progress"><i style="width:0%"></i></span><span class="count">0 / ${total}</span>`;
			actions.innerHTML = btn("Cancel", "ghost");
		},
		success(elapsed) {
			summary.innerHTML = `<span><b>${total} desqueezed</b> at ${FACTOR} in ${time(elapsed)}</span>`;
			actions.innerHTML = btn("Desqueeze more", "quiet") + btn("Reveal in Finder", "primary");
		},
	};

	if (reduceMotion) {
		// A finished batch, held still
		chip.classList.add("stowed");
		rows.forEach((r) => setRow(r, "done"));
		screens.success(4.21);
		return;
	}

	// The footer's contents crossfade between modes; the bar itself does not
	const swapFoot = (fn) => {
		app.style.setProperty("--app-foot", "0");
		after(300, () => {
			fn();
			app.style.setProperty("--app-foot", "1");
		});
	};

	const runBatch = () => {
		swapFoot(() => {
			screens.processing();
			const fill = summary.querySelector(".progress > i");
			const count = summary.querySelector(".count");
			const started = performance.now();
			let next = 0;
			let done = 0;

			const startNext = () => {
				if (next >= total) return;
				const row = rows[next++];
				setRow(row, "running");
				after(850 + Math.random() * 750, () => {
					setRow(row, "done");
					done++;
					fill.style.width = `${(done / total) * 100}%`;
					count.textContent = `${done} / ${total}`;
					if (done === total) after(600, () => finish((performance.now() - started) / 1000));
					else startNext();
				});
			};
			for (let i = 0; i < PARALLEL; i++) startNext();
		});
	};

	const finish = (elapsed) => {
		swapFoot(() => screens.success(elapsed));
		after(4600, () => {
			// The whole screen swaps: list and footer fade together
			app.style.setProperty("--app-content", "0");
			app.style.setProperty("--app-foot", "0");
			after(320, () => {
				screens.settings();
				app.style.setProperty("--app-content", "1");
				app.style.setProperty("--app-foot", "1");
				after(1800, runBatch);
			});
		});
	};

	let running = false;
	const begin = () => {
		running = true;
		screens.settings();
		app.style.setProperty("--app-content", "1");
		app.style.setProperty("--app-foot", "1");
		after(1800, runBatch);
	};
	const halt = () => {
		running = false;
		clearAll();
	};

	// Only run while on screen, and start from the top each time it returns
	const inView = () => {
		const r = app.getBoundingClientRect();
		return r.bottom > 0 && r.top < window.innerHeight;
	};
	if ("IntersectionObserver" in window) {
		new IntersectionObserver(
			(entries) => {
				const on = entries.some((e) => e.isIntersecting);
				if (on && !running && !document.hidden) begin();
				else if (!on && running) halt();
			},
			{ threshold: 0.15 }
		).observe(app);
	} else {
		begin();
	}
	document.addEventListener("visibilitychange", () => {
		if (document.hidden) halt();
		else if (!running && inView()) begin();
	});
}

/* ───────────────────────────────────────────────────────────── */

const hero = { state: { introDone: reduceMotion }, applyChroma: () => {} };
const grid = initGrid((f) => {
	// The title's RGB split rides the grid's stretch spring, exactly as
	// dg-app bridges onFrame into <dg-chroma-text>. The intro owns the
	// layers until it has settled.
	if (hero.state.introDone) hero.applyChroma(f.chromaOffset * 3);
});
Object.assign(hero, initHero(grid));
initBar();
initReveals(grid);
initDownloads();
initVersion();
initDemo();

const year = document.getElementById("year");
if (year) year.textContent = String(new Date().getFullYear());
