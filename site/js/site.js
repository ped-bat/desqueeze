/*
 * Desqueeze landing page — page wiring.
 *
 * Owns: the background dot grid, the hero intro, the squeeze demo, the
 * format chips, scroll reveals and the platform-aware download cards.
 */

import { DotGrid } from "./dot-grid.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ─────────────────────────────────────────────────────────────
   Background dot grid
   ───────────────────────────────────────────────────────────── */

function initGrid() {
	const canvas = document.getElementById("grid-canvas");
	if (!canvas || !canvas.getContext) return null;

	const title = document.getElementById("hero-title");
	const layerR = title?.querySelector(".layer-r");
	const layerB = title?.querySelector(".layer-b");

	const grid = new DotGrid(canvas, {
		onFrame: (f) => {
			// The title's RGB split rides the same spring as the grid stretch,
			// exactly as dg-app bridges onFrame into <dg-chroma-text>.
			if (!layerR || !layerB) return;
			const off = f.chromaOffset * 1.6;
			if (off > 0.05) {
				layerR.style.transform = `translateX(${off}px)`;
				layerB.style.transform = `translateX(${-off}px)`;
			} else if (layerR.style.transform) {
				layerR.style.transform = "";
				layerB.style.transform = "";
			}
		},
	});

	const fit = () => grid.resize(window.innerWidth, window.innerHeight);
	fit();

	// Reduced motion still gets the grid — just held still, with no cursor
	// magnetism, scroll drift or grain churn.
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

	// Pause when the tab is hidden — no point burning frames in the background
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
   Hero intro — body.ready releases the CSS transitions, and the
   grid pulses on the same beat as the wordmark's desqueeze.
   ───────────────────────────────────────────────────────────── */

function initHero(grid) {
	const reveal = () => {
		document.body.classList.add("ready");
		if (grid && !reduceMotion) setTimeout(() => grid.pulse(), 180);
	};

	// Wait for the variable font so the wordmark never desqueezes in a
	// fallback face and then snap-swaps mid-animation.
	if (document.fonts && document.fonts.load) {
		const timeout = new Promise((r) => setTimeout(r, 1200));
		Promise.race([document.fonts.load('600 60px "Science Gothic"'), timeout]).then(reveal, reveal);
	} else {
		reveal();
	}
}

/* ─────────────────────────────────────────────────────────────
   Header
   ───────────────────────────────────────────────────────────── */

function initHeader() {
	const header = document.getElementById("site-header");
	if (!header) return;
	const onScroll = () => header.classList.toggle("stuck", window.scrollY > 40);
	onScroll();
	window.addEventListener("scroll", onScroll, { passive: true });
}

/* ─────────────────────────────────────────────────────────────
   Scroll reveals
   ───────────────────────────────────────────────────────────── */

function initReveals(grid) {
	const items = document.querySelectorAll(".reveal");
	if (reduceMotion || !("IntersectionObserver" in window)) {
		items.forEach((el) => el.classList.add("in"));
		return;
	}

	const io = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				entry.target.classList.add("in");
				io.unobserve(entry.target);
				// A section head arriving pulses the grid, tying the background
				// to the reading position the way the app ties it to state.
				if (grid && entry.target.classList.contains("section-head")) grid.pulse();
			}
		},
		{ rootMargin: "0px 0px -12% 0px", threshold: 0.15 }
	);

	items.forEach((el) => io.observe(el));
}

/* ─────────────────────────────────────────────────────────────
   Squeeze demo

   The scene is authored 300f x 200 — a world that is f times wider than
   the sensor is. Dropping that viewBox into a 3:2 box with
   preserveAspectRatio="none" compresses it by exactly f (what the lens
   does); letting it fill a 3f:2 box restores it (what Desqueeze does).
   ───────────────────────────────────────────────────────────── */

const SCENE_H = 200;
const SCENE_UNIT_W = 300; // scene width at 1x

function buildChart(factor) {
	const w = SCENE_UNIT_W * factor;
	const cx = w / 2;
	const cy = SCENE_H / 2;
	const parts = [];

	parts.push(`<rect width="${w}" height="${SCENE_H}" fill="#0b0b0b"/>`);

	// Dot lattice — the app's own motif, and the clearest tell that
	// something has been squeezed: round dots become tall ellipses.
	const spacing = 25;
	const cols = Math.round(w / spacing);
	const rows = Math.round(SCENE_H / spacing);
	const ox = (w - (cols - 1) * spacing) / 2;
	const oy = (SCENE_H - (rows - 1) * spacing) / 2;
	const dots = [];
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			dots.push(`<circle cx="${(ox + c * spacing).toFixed(1)}" cy="${(oy + r * spacing).toFixed(1)}" r="1.7"/>`);
		}
	}
	parts.push(`<g fill="rgba(255,255,255,0.34)">${dots.join("")}</g>`);

	// Crosshair
	parts.push(
		`<g stroke="rgba(255,255,255,0.14)" stroke-width="1" fill="none">` +
			`<path d="M0 ${cy} H${w} M${cx} 0 V${SCENE_H}"/></g>`
	);

	// Reference geometry: a true circle and a true square
	parts.push(
		`<g fill="none">` +
			`<circle cx="${cx}" cy="${cy}" r="62" stroke="rgba(255,255,255,0.8)" stroke-width="1.7"/>` +
			`<circle cx="${cx}" cy="${cy}" r="34" stroke="rgba(255,255,255,0.3)" stroke-width="1.4"/>` +
			`<rect x="${cx - 44}" y="${cy - 44}" width="88" height="88" stroke="rgba(255,255,255,0.26)" stroke-width="1.4"/>` +
			`</g>`
	);

	// 45-degree corner ticks — they stop being 45 degrees when squeezed
	parts.push(
		`<g stroke="rgba(255,255,255,0.45)" stroke-width="1.5" fill="none">` +
			`<path d="M14 14 L44 44 M${w - 14} 14 L${w - 44} 44 ` +
			`M14 ${SCENE_H - 14} L44 ${SCENE_H - 44} M${w - 14} ${SCENE_H - 14} L${w - 44} ${SCENE_H - 44}"/></g>`
	);

	return { w, markup: parts.join("") };
}

function initDemo(grid) {
	const demo = document.getElementById("demo");
	if (!demo) return;

	const svgs = demo.querySelectorAll(".sensor svg");
	const label = document.getElementById("label-squeezed");
	const buttons = document.querySelectorAll(".seg [data-factor]");

	const apply = (factor) => {
		const { w, markup } = buildChart(factor);
		svgs.forEach((svg) => {
			svg.setAttribute("viewBox", `0 0 ${w} ${SCENE_H}`);
			svg.innerHTML = markup;
		});
		demo.style.setProperty("--f", String(factor));
		if (label) label.textContent = `${factor}× squeeze`;
		buttons.forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.factor) === factor)));
	};

	buttons.forEach((btn) => {
		btn.addEventListener("click", () => {
			apply(Number(btn.dataset.factor));
			if (grid && !reduceMotion) grid.pulse();
		});
	});

	apply(1.5);
}

/* ─────────────────────────────────────────────────────────────
   Format chips — kept in sync with the README's generated lists
   ───────────────────────────────────────────────────────────── */

const RAW_FORMATS = [
	"3fr", "ari", "arw", "cr2", "cr3", "crw", "dcr", "dcs", "dng", "erf", "iiq", "kdc", "mef",
	"mos", "mrw", "nef", "nrw", "orf", "pef", "raf", "raw", "rw2", "sr2", "srf", "srw",
];

const BITMAP_FORMATS = ["jpg", "jpeg", "png", "tif", "tiff", "webp"];

function initChips() {
	const fill = (id, list) => {
		const el = document.getElementById(id);
		if (!el) return;
		el.innerHTML = list.map((f) => `<span class="chip">.${f}</span>`).join("");
	};
	fill("raw-chips", RAW_FORMATS);
	fill("bitmap-chips", BITMAP_FORMATS);
}

/* ─────────────────────────────────────────────────────────────
   Download cards — surface the visitor's platform first
   ───────────────────────────────────────────────────────────── */

function initDownloads() {
	const ua = navigator.userAgent;
	let match = null;
	if (/Mac|iPhone|iPad/.test(ua)) match = "macOS";
	else if (/Win/.test(ua)) match = "Windows";
	else if (/Linux|X11/.test(ua)) match = "Linux";
	if (!match) return;

	document.querySelectorAll(".dl").forEach((card) => {
		if (card.querySelector(".os")?.textContent.trim() === match) card.classList.add("match");
	});
}

/* ───────────────────────────────────────────────────────────── */

const grid = initGrid();
initHero(grid);
initHeader();
initReveals(grid);
initDemo(grid);
initChips();
initDownloads();
