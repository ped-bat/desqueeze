import { LitElement, html, css, nothing } from "lit";
import { typography } from "../styles/typography.css.js";
import { effects } from "../styles/effects.css.js";

/**
 * <dg-actions> — the action set for the current mode.
 * Emits semantic events; dg-app decides what they do.
 *
 * Exactly one button per mode carries `btn-primary`, and it is always the
 * one the user came to press. The discard sits left of it and quiet, so
 * "Clear" and "Desqueeze 12 images" can no longer be mistaken for each
 * other the way two identical glass pills could.
 *
 * @fires browse         - open the native file picker
 * @fires start          - process the queued files
 * @fires clear          - discard the queued batch
 * @fires cancel         - stop the run (in-flight files finish)
 * @fires retry-failed   - re-run only the files that failed
 * @fires copy-errors    - copy the failure list to the clipboard
 * @fires show-result    - reveal the first output in the file manager
 * @fires desqueeze-more - start a new batch
 */
export class DgActions extends LitElement {
	static properties = {
		mode: { type: String },
		pendingCount: { type: Number },
		failedCount: { type: Number },
		successCount: { type: Number },
		cancelling: { type: Boolean },
	};

	static styles = [
		typography,
		effects,
		css`
			:host {
				display: flex;
				align-items: center;
				justify-content: center;
				gap: 8px;
				pointer-events: auto;
			}
		`,
	];

	constructor() {
		super();
		this.mode = "ready";
		this.pendingCount = 0;
		this.failedCount = 0;
		this.successCount = 0;
		this.cancelling = false;
	}

	render() {
		const btn = (event, label, role = "ghost", opts = {}) => html`
			<button
				class="btn btn-${role}"
				?disabled=${opts.disabled || false}
				@click=${() => this._emit(event)}
			>
				${label}
			</button>
		`;

		switch (this.mode) {
			case "ready":
				return btn("browse", "Choose files…", "primary");

			case "settings": {
				const n = this.pendingCount;
				if (n === 0) return btn("clear", "Clear", "ghost");
				return html`
					${btn("clear", "Clear", "quiet")}
					${btn("start", `Desqueeze ${n} ${n === 1 ? "image" : "images"}`, "primary")}
				`;
			}

			case "processing":
				return btn("cancel", this.cancelling ? "Cancelling…" : "Cancel", "ghost", {
					disabled: this.cancelling,
				});

			case "success":
				return html`
					${btn("desqueeze-more", "Desqueeze more", "quiet")}
					${this.successCount > 0
						? btn("show-result", "Reveal in Finder", "primary")
						: btn("browse", "Choose files…", "primary")}
				`;

			case "error":
				// No "Reveal results" here: every row that succeeded carries its
				// own Reveal, so a batch-wide one would be a second way to do the
				// same thing. The slot goes to starting over instead, which the
				// user otherwise had no route to from a partial failure.
				return html`
					${btn("copy-errors", "Copy errors", "quiet")}
					${btn("desqueeze-more", "Desqueeze more", "quiet")}
					${btn("retry-failed", `Retry the ${this.failedCount} that failed`, "primary")}
				`;

			default:
				return nothing;
		}
	}

	_emit(name) {
		this.dispatchEvent(new CustomEvent(name, { bubbles: true, composed: true }));
	}
}

customElements.define("dg-actions", DgActions);
