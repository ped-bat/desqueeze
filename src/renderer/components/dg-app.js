import { LitElement, html, css, nothing } from "lit";
import { store, StoreController } from "../state/app-state.js";
import { ipc } from "../services/ipc.js";
import "./dg-canvas.js";
import "./dg-chroma-text.js";
import "./dg-settings-panel.js";
import "./dg-actions.js";
import "./dg-letterbox.js";

/** Title label per mode */
const TITLES = {
	ready: "Desqueeze.io",
	settings: "Settings",
	processing: "Processing",
	error: "Error!",
	success: "Success!",
};

/**
 * <dg-app> — root component. Owns the store lifecycle, the drop zone,
 * and bridges the engine's frame/swap callbacks to the text components.
 *
 * `store.mode` drives the engine transition; `displayMode` (what text is
 * currently shown) lags behind and flips at the transition midpoint via
 * the engine's onSwap callback, matching the original crossfade.
 */
export class DgApp extends LitElement {
	static properties = {
		displayMode: { type: String, state: true },
		captionText: { type: String, state: true },
	};

	static styles = css`
		:host {
			display: block;
			position: absolute;
			inset: 0;
			overflow: hidden;
		}

		.titlebar-drag {
			-webkit-app-region: drag;
			height: 48px;
			position: absolute;
			top: 0;
			left: 0;
			right: 0;
			z-index: 50;
		}

		.content {
			position: absolute;
			top: 50%;
			left: 50%;
			transition: top 0.3s ease;
			transform: translate(-50%, -50%);
			display: flex;
			flex-direction: column;
			align-items: center;
			pointer-events: none;
			z-index: 1;
		}

		dg-chroma-text[variant="subtitle"] {
			margin-top: 1.5rem;
			z-index: 2;
		}

		.actions-slot {
			position: absolute;
			top: 100%;
			left: 0;
			right: 0;
			display: flex;
			justify-content: center;
			margin-top: 2.4em;
			font-size: var(--dg-font-size-sub);
		}

		.actions-slot.ready {
			/* vh cap keeps the button clear of the bottom caption in short windows */
			margin-top: min(4.4em, 10vh);
		}

		.actions-slot.in-flow {
			position: relative;
			top: auto;
			margin-top: 2.4em;
		}

		/* Ready only: slightly above center so the actions keep clear of the
		   bottom caption. Other modes stay dead-centered. */
		.content.raised {
			top: 46.5%;
		}

		/* Caption crossfade timed to the engine's content fades:
		   fast fade-out (~first third of the 0.3s transition), text swap at
		   the midpoint, slower fade-in through the rest. */
		dg-letterbox[position="bottom"] {
			transition: opacity 0.2s ease;
		}

		dg-letterbox[position="bottom"].caption-fade {
			opacity: 0;
			transition: opacity 0.12s ease;
		}
	`;

	constructor() {
		super();
		new StoreController(this);
		this.displayMode = "ready";
		this.captionText = "Images processed locally, no uploads";
		this._prevent = this._prevent.bind(this);
		this._onDropBound = (e) => this._onDrop(e);
	}

	connectedCallback() {
		super.connectedCallback();
		store.init();
		// Drop zone covers the whole window, overlays included
		this.addEventListener("dragenter", this._prevent);
		this.addEventListener("dragover", this._prevent);
		this.addEventListener("drop", this._onDropBound);
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		this.removeEventListener("dragenter", this._prevent);
		this.removeEventListener("dragover", this._prevent);
		this.removeEventListener("drop", this._onDropBound);
		clearTimeout(this._captionTimer);
	}

	render() {
		return html`
			<dg-canvas
				.mode=${store.mode}
				.onFrame=${(f) => this._applyFrame(f)}
				.onSwap=${(m) => (this.displayMode = m)}
			></dg-canvas>

			<div class="titlebar-drag"></div>

			<dg-letterbox position="bottom">
				<span>${this.captionText}</span>
			</dg-letterbox>

			<div class="content ${this.displayMode === "ready" ? "raised" : ""}">
				<dg-chroma-text
					id="title"
					variant="title"
					.text=${TITLES[this.displayMode]}
				></dg-chroma-text>

				${this.displayMode === "settings"
					? html`<dg-settings-panel id="settings"></dg-settings-panel>`
					: html`
							<dg-chroma-text
								id="subtitle"
								variant="subtitle"
								.text=${this._subtitle()}
							></dg-chroma-text>
						`}

				<div class="actions-slot ${this.displayMode === "settings" ? "in-flow" : this.displayMode}">
					<dg-actions
						id="actions"
						.mode=${this.displayMode}
						.pendingCount=${store.pendingFiles.length}
						@browse=${this._onBrowse}
						@start=${() => store.processPending()}
						@back=${() => store.cancelPending()}
						@retry=${() => store.setMode("ready")}
						@show-result=${() => store.revealResult()}
						@desqueeze-more=${() => store.setMode("ready")}
					></dg-actions>
				</div>
			</div>
		`;
	}

	// ── Subtitle content per display mode ──

	_subtitle() {
		const plural = (n) => (n === 1 ? "image" : "images");
		switch (this.displayMode) {
			case "ready":
				return "Lossless anamorphic image processor";
			case "processing": {
				const { done, total } = store.progress;
				return `${done} out of ${total} ${plural(total)}`;
			}
			case "error": {
				const r = store.result;
				if (!r) return "Something went wrong";
				const msg = r.firstError ? ` — ${r.firstError}` : "";
				return `${r.failedCount} ${plural(r.failedCount)} failed${msg}`;
			}
			case "success": {
				const r = store.result;
				if (!r) return "";
				if (r.successCount === 0)
					return `${r.skippedCount} ${plural(r.skippedCount)} already desqueezed`;
				const skipped = r.skippedCount > 0 ? `, ${r.skippedCount} already desqueezed` : "";
				return `${r.successCount} ${plural(r.successCount)} desqueezed to ${r.factor}x${skipped}`;
			}
			default:
				return "";
		}
	}

	// ── Bottom caption ──
	// captionText lags the computed target by a fade-out so any change —
	// mode switch or a settings-hint change — crossfades instead of
	// hard-swapping (see updated()).

	_captionFor(mode) {
		switch (mode) {
			case "settings":
				return this._hint();
			case "processing":
				return "";
			case "success": {
				const r = store.result;
				return r && r.successCount > 0 ? `Processed in ${this._formatTime(r.elapsed)}` : "";
			}
			default:
				return "Images processed locally, no uploads";
		}
	}

	updated() {
		// Keyed off store.mode (not displayMode) so the fade-out starts the
		// moment a transition begins, in sync with the engine's content fades.
		const target = this._captionFor(store.mode);
		if (target === this.captionText) return;
		const box = this.renderRoot.querySelector('dg-letterbox[position="bottom"]');
		box?.classList.add("caption-fade");
		clearTimeout(this._captionTimer);
		this._captionTimer = setTimeout(() => {
			// Recompute — the target may have changed again mid-fade
			this.captionText = this._captionFor(store.mode);
			box?.classList.remove("caption-fade");
		}, 120);
	}

	_hint() {
		if (store.format === "dng") return "These settings are lossless";
		const lossy = store.format === "jpg" || (store.format === "webp" && !store.formatOptions.webp.lossless);
		return lossy
			? "Pixel data is resampled — these settings are lossy"
			: "Pixel data is resampled for this format";
	}

	_formatTime(seconds) {
		if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
		if (seconds < 60) return `${seconds.toFixed(2)}s`;
		return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
	}

	// ── Engine frame bridge ──

	_applyFrame(f) {
		const $ = (id) => this.renderRoot.getElementById(id);
		$("title")?.applyFrame(f.title);
		$("subtitle")?.applyFrame(f.subtitle);

		const actions = $("actions");
		if (actions) {
			actions.style.opacity = f.actions.opacity;
			actions.style.fontVariationSettings = `'wght' ${f.actions.wght}, 'wdth' ${f.actions.wdth}`;
			actions.style.letterSpacing = `${f.actions.letterSpacing}px`;
			actions.style.transform = `scaleX(${f.actions.scaleX})`;
		}
		const settings = $("settings");
		if (settings) settings.style.opacity = f.subtitle.opacity;
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
