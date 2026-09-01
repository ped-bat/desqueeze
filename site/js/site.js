/*
 * Desqueeze landing page — page wiring.
 *
 * Owns: the background dot grid, the hero intro, the format chips, scroll
 * reveals and the platform-aware download cards.
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
		Promise.race([document.fonts.load('300 60px "Science Gothic"'), timeout]).then(reveal, reveal);
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
initChips();
initDownloads();
