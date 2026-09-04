import { LitElement, html, css, nothing } from "lit";
import { typography } from "../styles/typography.css.js";
import { store, StoreController } from "../state/app-state.js";

/**
 * <dg-footer-bar> — persistent action bar across the bottom of the surface.
 *
 * The batch summary sits left, the actions slot right, and both stay in the
 * same place in every mode, so the primary button never moves between the
 * confirm step and the result. During processing the summary becomes the
 * overall progress rule.
 */
export class DgFooterBar extends LitElement {
	static properties = {
		/** Lagged display mode from dg-app: flips at the engine's transition
		 *  midpoint, so the summary swaps while it is faded out. */
		mode: { type: String },
	};

	static styles = [
		typography,
		css`
			:host {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				position: relative;
				min-height: var(--dg-bar-h);
				padding: 0 var(--dg-bar-pad);
				background: var(--dg-chrome);
			}


			/* The rule fades out towards both ends: full strength at the
			   centre, nothing at the edges. A hairline running the whole
			   width boxed the window in; this reads as a horizon instead.
			   Drawn as a pseudo-element because a border cannot hold a
			   gradient. */
			:host::after {
				content: "";
				position: absolute;
				left: 0;
				right: 0;
				height: 1px;
				pointer-events: none;
				background: linear-gradient(
					to right,
					var(--dg-chrome-border-end) 0%,
					var(--dg-chrome-border) 50%,
					var(--dg-chrome-border-end) 100%
				);
			}

			:host::after {
				top: 0;
			}

			/* Contents fade, the bar itself does not: the chrome is permanent,
			   what it says is not. dg-app writes this per frame. */
			.summary,
			::slotted(*) {
				opacity: var(--dg-content-opacity, 1);
			}

			.summary {
				display: flex;
				align-items: center;
				gap: 0.6em;
				min-width: 0;
				flex: 1;
				font-family: var(--dg-font);
				font-size: var(--dg-ui-sm);
				font-variation-settings: var(--dg-var-ui);
				color: var(--dg-fg-soft);
			}

			.summary b {
				font-variation-settings: var(--dg-var-ui-strong);
				font-weight: normal;
				color: var(--dg-fg-strong);
			}

			.summary .bad {
				color: var(--dg-bad-soft);
				font-variation-settings: var(--dg-var-ui-strong);
			}

			.bar {
				flex: 0 1 220px;
				height: 3px;
				border-radius: 3px;
				background: rgba(255, 255, 255, 0.13);
				overflow: hidden;
			}

			.bar > i {
				display: block;
				height: 100%;
				border-radius: 3px;
				background: var(--dg-accent);
				transition: width 0.25s ease;
			}

			.count {
				font-variant-numeric: tabular-nums;
				color: var(--dg-fg-strong);
			}

			.actions {
				display: flex;
				align-items: center;
				gap: 8px;
				flex: none;
			}
		`,
	];

	constructor() {
		super();
		new StoreController(this);
		this.mode = "ready";
	}

	render() {
		return html`
			<div class="summary">${this._summary()}</div>
			<div class="actions"><slot name="actions"></slot></div>
		`;
	}

	_summary() {
		const r = store.result;
		const { done, total } = store.progress;

		switch (this.mode) {
			case "processing":
				return html`
					<span class="bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></span>
					<span class="count">${done} / ${total}</span>
					${store.cancelRequested
						? html`<span>Cancelling - finishing the files already started</span>`
						: nothing}
				`;

			case "success": {
				if (!r) return nothing;
				if (r.successCount === 0 && r.skippedCount > 0)
					return html`<span
						>Nothing to do - <b>${r.skippedCount}</b> already desqueezed</span
					>`;
				if (r.successCount === 0 && r.cancelledCount > 0)
					return html`<span>Cancelled - <b>${r.cancelledCount}</b> not processed</span>`;
				return html`<span
					><b>${r.successCount} desqueezed</b> at ${store.factorLabel} in
					${this._time(r.elapsed)}</span
				>`;
			}

			case "error": {
				const failed = store.failedFiles.length;
				return html`<span
					><span class="bad">${failed} failed</span> ·
					<b>${r?.successCount ?? 0} desqueezed</b> at ${store.factorLabel}</span
				>`;
			}

			case "settings": {
				const skipped = store.files.length - total;
				return html`<span
					><b>${total} ${total === 1 ? "file" : "files"}</b> · ${store.factorLabel} ·
					${store.formatLabel}${skipped > 0 ? ` · ${skipped} skipped` : ""}</span
				>`;
			}

			default:
				return html`<span>Images processed on this machine, nothing is uploaded.</span>`;
		}
	}

	_time(seconds) {
		if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
		if (seconds < 60) return `${seconds.toFixed(2)}s`;
		return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
	}
}

customElements.define("dg-footer-bar", DgFooterBar);
