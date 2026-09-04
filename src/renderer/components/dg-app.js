import { LitElement, html, css, nothing, unsafeCSS } from "lit";
import { store, StoreController } from "../state/app-state.js";
import { ipc } from "../services/ipc.js";
import { ENGINE_CONFIG } from "../core/config.js";
import "./dg-canvas.js";
import "./dg-chroma-text.js";
import "./dg-settings-panel.js";
import "./dg-actions.js";
import "./dg-top-bar.js";
import "./dg-file-list.js";
import "./dg-footer-bar.js";

/**
 * The CRT tube, built from the same numbers the engine used to paint onto
 * the canvas: a vignette from 40% of the half-diagonal out to the corners,
 * plus a curvature shadow banding each edge.
 */
const CRT = ENGINE_CONFIG.crt;
const crtEdge = (dir) =>
	`linear-gradient(to ${dir}, rgba(0, 0, 0, ${CRT.curvature * 8}) 0%, rgba(0, 0, 0, 0) ${CRT.curvature * 400}%)`;
const CRT_BACKGROUND = [
	`radial-gradient(circle farthest-corner at 50% 50%, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, ${CRT.vignetteStrength}) 100%)`,
	crtEdge("bottom"),
	crtEdge("top"),
	crtEdge("right"),
	crtEdge("left"),
].join(", ");

/**
 * <dg-app> — root component.
 *
 * The window is a persistent working surface: a top bar carrying the
 * wordmark and live settings, a body, and a footer action bar. The body is
 * the ceremony while nothing is queued, and the file list from the moment
 * something is. The dot grid keeps running full-bleed behind both, knocked
 * back by a scrim over the body once there are filenames to read against it.
 */
export class DgApp extends LitElement {
	static properties = {
		displayMode: { type: String, state: true },
		dragging: { type: Boolean, state: true },
	};

	static styles = css`
		:host {
			display: block;
			position: absolute;
			inset: 0;
			overflow: hidden;
		}

		.shell {
			position: absolute;
			inset: 0;
			z-index: 6;
			display: flex;
			flex-direction: column;
			min-height: 0;
		}

		/* ── The CRT ──────────────────────────────────────────────
		   Three screen-wide layers above everything — the shell, the drop
		   ring, the settings popover. The tube encloses the whole picture,
		   so its scanlines, vignette and edge curvature fall across the bars,
		   the file rows and the buttons, not just the dot grid behind them.
		   (The scanlines used to live inside dg-canvas, under the chrome;
		   that put the controls outside the screen being imitated.) */
		.scanlines,
		.crt,
		.flicker {
			position: absolute;
			inset: 0;
			pointer-events: none;
		}

		.scanlines {
			z-index: 100;
			background: repeating-linear-gradient(
				to bottom,
				transparent 0px,
				transparent 1px,
				rgba(0, 0, 0, 0.14) 1px,
				rgba(0, 0, 0, 0.14) 2px
			);
		}

		.crt {
			z-index: 101;
			background: ${unsafeCSS(CRT_BACKGROUND)};
		}

		/* Tube flicker, driven per frame from the engine. */
		.flicker {
			z-index: 102;
			opacity: 0;
		}

		.body {
			flex: 1;
			min-height: 0;
			display: flex;
			flex-direction: column;
			/* Matches the bars' horizontal padding so the file rows line up
			   with the wordmark above and the summary below. */
			padding: 16px var(--dg-bar-pad);
			background-color: transparent;
			transition: background-color 0.35s ease;
		}

		/* The grid is knocked back behind filenames, and only there. The bars
		   keep the full-strength grid behind them in every state, which is
		   what lets them render identically on both screens. */
		.body.on-backdrop {
			background-color: var(--dg-body-scrim);
		}

		/* ── Empty state ───────────────────────────────────────
		   No resting outline: the whole window is the drop target, and
		   drawing a box around the hero only fenced it in. Drag feedback
		   is the window-edge ring below, the same cue the file list gets,
		   so both states answer a drag the same way. */
		.stage {
			flex: 1;
			min-height: 0;
			display: flex;
			flex-direction: column;
			align-items: center;
			justify-content: center;
			gap: 1.1rem;
			text-align: center;
			padding: 2rem;
			border-radius: 10px;
			transition: background 0.18s ease;
		}

		:host([dragging]) .stage {
			background: var(--dg-accent-wash);
		}

		dg-chroma-text[variant="subtitle"] {
			margin-top: 0.2rem;
		}

		.stage dg-actions {
			margin-top: 0.8rem;
		}

		/* Resting hidden. _applyFrame writes an opacity to each of these every
		   frame; without a hidden resting state a screen mounted at the
		   transition midpoint paints at full opacity for the one frame before
		   its first value lands, which is the flash the hero used to have. */
		dg-file-list,
		.stage dg-actions {
			opacity: 0;
		}

		/* Drop feedback in every state: a ring on the window edge. */
		.dropring {
			position: absolute;
			inset: 6px;
			z-index: 20;
			border: 2px solid var(--dg-accent-ring);
			border-radius: 12px;
			pointer-events: none;
			background: var(--dg-accent-wash);
		}

		/* ── Settings popover ────────────────────────────────────
		   The wrapper only positions. The fade and the scale live on the
		   panel itself, which is also the element carrying the
		   backdrop-filter, and that pairing is deliberate: an ancestor with
		   opacity below 1 forms a backdrop root, so a descendant's
		   backdrop-filter has nothing behind it to sample. Animating the
		   wrapper meant the panel stayed unblurred for the whole fade and
		   the blur snapped in the instant opacity reached 1. Kept mounted
		   and toggled by class, so there is something to animate out from. */
		.popover {
			position: absolute;
			top: calc(var(--dg-bar-h) + 6px);
			right: var(--dg-bar-pad);
			z-index: 40;
		}

		.popover dg-settings-panel {
			display: block;
			transform-origin: top right;
			opacity: 0;
			visibility: hidden;
			transform: translateY(-6px) scale(0.97);
			pointer-events: none;
			transition:
				opacity 0.14s ease,
				transform 0.14s ease,
				visibility 0s linear 0.14s;
		}

		.popover.open dg-settings-panel {
			opacity: 1;
			visibility: visible;
			transform: translateY(0) scale(1);
			pointer-events: auto;
			transition:
				opacity 0.16s ease,
				transform 0.22s cubic-bezier(0.16, 1, 0.3, 1),
				visibility 0s;
		}

		@media (prefers-reduced-motion: reduce) {
			.popover dg-settings-panel,
			.popover.open dg-settings-panel {
				transform: none;
				transition:
					opacity 0.01s linear,
					visibility 0s;
			}
		}
	`;

	constructor() {
		super();
		new StoreController(this);
		this.displayMode = "ready";
		this.dragging = false;
		this._dragDepth = 0;
		this._prevent = this._prevent.bind(this);
		this._onDropBound = (e) => this._onDrop(e);
		this._onDragEnter = (e) => {
			this._prevent(e);
			this._dragDepth++;
			if (store.mode !== "processing") this.dragging = true;
		};
		this._onDragLeave = (e) => {
			this._prevent(e);
			this._dragDepth = Math.max(0, this._dragDepth - 1);
			if (this._dragDepth === 0) this.dragging = false;
		};
		this._onDocClick = () => {
			if (store.settingsOpen) store.toggleSettings(false);
		};
		this._onKey = (e) => {
			if (e.key === "Escape" && store.settingsOpen) store.toggleSettings(false);
		};
	}

	connectedCallback() {
		super.connectedCallback();
		store.init();
		// Drop zone covers the whole window, overlays included
		this.addEventListener("dragenter", this._onDragEnter);
		this.addEventListener("dragover", this._prevent);
		this.addEventListener("dragleave", this._onDragLeave);
		this.addEventListener("drop", this._onDropBound);
		document.addEventListener("click", this._onDocClick);
		document.addEventListener("keydown", this._onKey);
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this.removeEventListener("dragenter", this._onDragEnter);
		this.removeEventListener("dragover", this._prevent);
		this.removeEventListener("dragleave", this._onDragLeave);
		this.removeEventListener("drop", this._onDropBound);
		document.removeEventListener("click", this._onDocClick);
		document.removeEventListener("keydown", this._onKey);
	}

	updated(changed) {
		if (changed.has("dragging")) this.toggleAttribute("dragging", this.dragging);
	}

	render() {
		// Keyed off displayMode, not store.mode: displayMode flips at the
		// engine's transition midpoint, so a screen is swapped while it is
		// faded out instead of being replaced between two visible frames.
		// dg-canvas below still takes the live store.mode — the engine has to
		// start the transition that displayMode is waiting on.
		const showList = this.displayMode !== "ready" && store.files.length > 0;

		return html`
			<dg-canvas
				.mode=${store.mode}
				.onFrame=${(f) => this._applyFrame(f)}
				.onSwap=${(m) => (this.displayMode = m)}
			></dg-canvas>

			<div class="scanlines"></div>
			<div class="crt"></div>
			<div class="flicker" id="flicker"></div>

			<div class="shell">
				<dg-top-bar
					.open=${store.settingsOpen}
					@toggle-settings=${() => store.toggleSettings()}
				></dg-top-bar>

				<div class="body ${showList ? "on-backdrop" : ""}">
					${showList
						? html`<dg-file-list
								id="filelist"
								@reveal=${(e) => store.revealFile(e.detail.path)}
								@remove=${(e) => store.removeFile(e.detail.path)}
							></dg-file-list>`
						: this._stage()}
				</div>

				<dg-footer-bar id="footer" .mode=${this.displayMode}>
					${showList
						? html`<dg-actions
						slot="actions"
						.mode=${this.displayMode}
						.pendingCount=${store.actionable.length}
						.failedCount=${store.failedFiles.length}
						.successCount=${store.result?.successCount ?? 0}
						.cancelling=${store.cancelRequested}
						@browse=${this._onBrowse}
						@start=${() => store.processPending()}
						@clear=${() => store.clearFiles()}
						@cancel=${() => store.cancelProcessing()}
						@retry-failed=${() => store.retryFailed()}
						@save-log=${() => store.saveErrorLog()}
						@show-result=${() => store.revealResult()}
						@desqueeze-more=${() => store.clearFiles()}
					></dg-actions>`
						: nothing}
				</dg-footer-bar>
			</div>

			${this.dragging ? html`<div class="dropring"></div>` : nothing}

			<div
				class="popover ${store.settingsOpen ? "open" : ""}"
				?inert=${!store.settingsOpen}
				@click=${(e) => e.stopPropagation()}
			>
				<dg-settings-panel></dg-settings-panel>
			</div>
		`;
	}

	/** The empty state: the ceremony, with the drop target made visible. */
	_stage() {
		return html`
			<div class="stage">
				<dg-chroma-text id="title" variant="title" text="Drop images here"></dg-chroma-text>
				<dg-chroma-text
					id="subtitle"
					variant="subtitle"
					text="RAW, JPG, PNG, TIFF or WebP - folders work too"
				></dg-chroma-text>
				<dg-actions
					id="actions"
					mode="ready"
					@browse=${this._onBrowse}
				></dg-actions>
			</div>
		`;
	}

	// ── Engine frame bridge ──

	/**
	 * Only the display text takes per-frame typography from the engine.
	 * The chrome does not: the engine emits stretch values for weight,
	 * width, tracking and scaleX, and applying those to buttons pulled
	 * their labels apart mid-transition. Opacity is the one value the
	 * action row still takes, so it fades with the rest of the content.
	 */
	_applyFrame(f) {
		const $ = (id) => this.renderRoot.getElementById(id);
		$("title")?.applyFrame(f.title);
		$("subtitle")?.applyFrame(f.subtitle);

		// One crossfade envelope for everything that swaps on a mode change:
		// the hero's own layers take theirs above, and the list and the
		// footer's contents ride the same curve, so one screen fades out and
		// the next fades in instead of toggling between frames.
		const o = f.actions.opacity;
		const actions = $("actions");
		if (actions) actions.style.opacity = o;

		const list = $("filelist");
		if (list) list.style.opacity = o;

		$("footer")?.style.setProperty("--dg-content-opacity", o);

		const flicker = $("flicker");
		if (flicker) {
			const amount = f.crt?.flicker || 0;
			flicker.style.opacity = Math.abs(amount);
			flicker.style.background = amount > 0 ? "#ffffff" : "#000000";
		}
	}

	// ── File intake ──

	_prevent(e) {
		e.preventDefault();
		e.stopPropagation();
	}

	async _onBrowse() {
		const selection = await ipc.selectImageFile();
		if (!selection || selection.length === 0) return;
		store.queueFiles(selection);
	}

	async _onDrop(e) {
		this._prevent(e);
		this._dragDepth = 0;
		this.dragging = false;
		if (store.mode === "processing") return;

		const paths = Array.from(e.dataTransfer.files)
			.map((f) => ipc.getPathForFile(f))
			.filter(Boolean);
		if (paths.length === 0) return;

		const expanded = await ipc.expandDroppedPaths(paths);
		if (expanded.length === 0) {
			await ipc.showErrorDialog("Unsupported Files", "No supported image files were found.");
			return;
		}
		store.queueFiles(expanded);
	}
}

customElements.define("dg-app", DgApp);
