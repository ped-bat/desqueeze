import { LitElement, html, css } from "lit";
import { typography } from "../styles/typography.css.js";
import { store, StoreController } from "../state/app-state.js";

/**
 * <dg-top-bar> — persistent chrome across the top of the working surface.
 *
 * Carries the wordmark and a settings chip that always shows the factor and
 * output format in effect. Before this the only route to those controls was
 * to drop files first, so there was no way to check what 1.33x was set to
 * before committing a batch.
 *
 * @fires toggle-settings - the chip was clicked
 */
export class DgTopBar extends LitElement {
	static properties = {
		open: { type: Boolean, reflect: true },
	};

	static styles = [
		typography,
		css`
			:host {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 1rem;
				min-height: var(--dg-bar-h);
				padding: 0 var(--dg-bar-pad);
				border-bottom: 1px solid var(--dg-chrome-border);
				background: var(--dg-chrome);
				backdrop-filter: var(--dg-blur-glass);
				-webkit-backdrop-filter: var(--dg-blur-glass);
				/* Sits under the draggable titlebar strip, so the bar itself
				   must opt its controls back in to pointer events. */
				-webkit-app-region: drag;
			}

			/* macOS uses titleBarStyle "hiddenInset" with the traffic lights
			   at x:16 (see main/index.js), so the wordmark has to start
			   clear of them. Other platforms keep a standard frame. */
			:host(.mac) {
				padding-left: 88px;
			}

			.mark {
				font-family: var(--dg-font);
				font-size: var(--dg-ui-lg);
				font-variation-settings: var(--dg-var-mark);
				letter-spacing: 0.06em;
				text-transform: uppercase;
				color: var(--dg-fg-strong);
			}

			.chip {
				-webkit-app-region: no-drag;
				display: inline-flex;
				align-items: center;
				gap: 0.45em;
				font-family: var(--dg-font);
				font-size: var(--dg-ui-sm);
				font-variation-settings: var(--dg-var-ui);
				color: var(--dg-fg-strong);
				background: rgba(255, 255, 255, 0.05);
				border: 1px solid rgba(255, 255, 255, 0.16);
				border-radius: 6px;
				padding: 8px 13px;
				cursor: pointer;
				transition:
					background 0.16s ease,
					border-color 0.16s ease;
			}

			.chip:hover,
			:host([open]) .chip {
				background: rgba(255, 255, 255, 0.1);
				border-color: rgba(255, 255, 255, 0.3);
			}

			.chip:focus-visible {
				outline: 2px solid var(--dg-accent-ring);
				outline-offset: 2px;
			}

			.k {
				color: var(--dg-fg-faint);
			}

			.cv {
				font-size: 0.8em;
				opacity: 0.6;
				transition: transform 0.16s ease;
			}

			:host([open]) .cv {
				transform: rotate(180deg);
			}
		`,
	];

	constructor() {
		super();
		new StoreController(this);
		this.open = false;
	}

	connectedCallback() {
		super.connectedCallback();
		if (/Macintosh|Mac OS X/i.test(navigator.userAgent)) this.classList.add("mac");
	}

	render() {
		return html`
			<span class="mark">Desqueeze.io</span>
			<button
				class="chip"
				aria-expanded=${this.open ? "true" : "false"}
				aria-label="Output settings"
				@click=${this._toggle}
			>
				<span class="k">Factor</span> ${store.factorLabel}
				<span class="k">·</span> ${store.formatLabel}
				<span class="cv">&#9662;</span>
			</button>
		`;
	}

	_toggle(e) {
		// The document-level click listener that closes the panel would
		// otherwise swallow this the moment it opens.
		e.stopPropagation();
		this.dispatchEvent(new CustomEvent("toggle-settings", { bubbles: true, composed: true }));
	}
}

customElements.define("dg-top-bar", DgTopBar);
