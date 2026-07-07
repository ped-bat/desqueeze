import { LitElement, html, css, nothing } from "lit";
import { typography } from "../styles/typography.css.js";
import { effects } from "../styles/effects.css.js";

/**
 * <dg-actions> — per-mode action buttons under the subtitle.
 * Emits semantic events; dg-app decides what they do.
 *
 * @fires browse    - open the native file picker
 * @fires start     - process the queued files (settings confirm step)
 * @fires back      - leave settings, discarding queued files
 * @fires retry     - back to ready after an error
 * @fires show-result - reveal the first processed file in Finder
 * @fires desqueeze-more - back to ready after success
 */
export class DgActions extends LitElement {
	static properties = {
		mode: { type: String },
		pendingCount: { type: Number },
	};

	static styles = [
		typography,
		effects,
		css`
			:host {
				display: flex;
				justify-content: center;
				align-items: center;
				white-space: nowrap;
				text-align: center;
				pointer-events: auto;
				z-index: 2;
				font-family: var(--dg-font);
				font-size: var(--dg-font-size-sub);
				font-weight: 300;
				text-transform: uppercase;
				letter-spacing: var(--dg-tracking);
				text-shadow: var(--dg-glow-white);
			}

			.desc {
				font-size: 0.9em;
				/* same hierarchy level as the bottom caption */
				color: var(--dg-fg-mid);
				letter-spacing: var(--dg-tracking-bar);
				line-height: 2.2;
			}

			.stack {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 0.5em;
			}
		`,
	];

	constructor() {
		super();
		this.mode = "ready";
		this.pendingCount = 0;
	}

	render() {
		const btn = (event, label, cls = "btn") =>
			html`<a class="${cls} glass" @click=${() => this._emit(event)}>${label}</a>`;

		switch (this.mode) {
			case "ready":
				return html`
					<div class="stack">
						<span class="desc">Drag and drop anywhere, or</span>
						<span>${btn("browse", "Browse files")}</span>
					</div>
				`;
			case "settings": {
				const n = this.pendingCount;
				const label = `Desqueeze ${n} ${n === 1 ? "image" : "images"}`;
				return html`
					${btn("back", n > 0 ? "Cancel" : "Back")}
					${n > 0 ? btn("start", label) : nothing}
				`;
			}
			case "error":
				return btn("retry", "Try again");
			case "success":
				return html`${btn("show-result", "Show result")} ${btn("desqueeze-more", "Desqueeze more")}`;
			default:
				// processing: no actions (no cancel IPC exists)
				return nothing;
		}
	}

	_emit(name) {
		this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
	}
}

customElements.define("dg-actions", DgActions);
