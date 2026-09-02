import { LitElement, html, css, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { typography } from "../styles/typography.css.js";
import { store, StoreController } from "../state/app-state.js";

/** Row status → visible label. "skipped" states why, rather than vanishing. */
const STATUS_LABEL = {
	queued: "Queued",
	running: "Converting",
	done: "Done",
	failed: "Failed",
	cancelled: "Cancelled",
	skipped: "Already desqueezed",
};

/**
 * <dg-file-list> — the batch, one row per file.
 *
 * Replaces the single "3 out of 12 images" counter. Each row carries its own
 * source format, name, target format and state, so a failure names itself and
 * its error instead of being truncated into "Failed: a, b, c and 37 more".
 *
 * @fires reveal - CustomEvent<{path:string}> when a finished row is clicked
 */
export class DgFileList extends LitElement {
	static styles = [
		typography,
		css`
			:host {
				display: flex;
				flex-direction: column;
				min-height: 0;
				flex: 1;
				gap: 8px;
			}

			.head {
				display: flex;
				align-items: baseline;
				justify-content: space-between;
				gap: 1rem;
				font-family: var(--dg-font);
				font-size: var(--dg-ui-sm);
				font-variation-settings: var(--dg-var-ui);
				color: var(--dg-fg-faint);
				padding: 0 2px;
			}

			.scroller {
				flex: 1;
				min-height: 0;
				overflow-y: auto;
				overscroll-behavior: contain;
				display: flex;
				flex-direction: column;
				gap: 2px;
				padding-right: 2px;
			}

			.scroller::-webkit-scrollbar {
				width: 10px;
			}
			.scroller::-webkit-scrollbar-thumb {
				background: rgba(255, 255, 255, 0.14);
				border-radius: 6px;
				border: 3px solid transparent;
				background-clip: content-box;
			}
			.scroller::-webkit-scrollbar-thumb:hover {
				background: rgba(255, 255, 255, 0.26);
				background-clip: content-box;
			}

			.row {
				position: relative;
				display: grid;
				grid-template-columns: 3.6em minmax(0, 1fr) auto auto;
				align-items: center;
				gap: 10px;
				padding: 7px 10px;
				border-radius: 6px;
				background: var(--dg-row);
				overflow: hidden;
			}

			.row > * {
				position: relative;
				z-index: 2;
			}

			/* Conversion is not a measurable percentage per file — dnglab
			   reports start and finish, nothing between — so a running row
			   gets an honest indeterminate sweep rather than a fake bar. */
			.row.running::before {
				content: "";
				position: absolute;
				inset: 0;
				z-index: 1;
				background: linear-gradient(
					90deg,
					transparent,
					var(--dg-accent-wash),
					transparent
				);
				background-size: 45% 100%;
				background-repeat: no-repeat;
				animation: dg-sweep 1.15s ease-in-out infinite;
			}

			@keyframes dg-sweep {
				from {
					background-position: -45% 0;
				}
				to {
					background-position: 145% 0;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.row.running::before {
					animation: none;
					background: var(--dg-accent-wash);
					background-size: 100% 100%;
				}
			}

			.row.failed {
				background: var(--dg-bad-wash);
				box-shadow: inset 2px 0 0 var(--dg-bad);
			}

			.row.skipped {
				opacity: 0.55;
			}

			.badge {
				font-family: var(--dg-mono);
				font-size: var(--dg-ui-xs);
				color: var(--dg-fg-soft);
				border: 1px solid rgba(255, 255, 255, 0.17);
				border-radius: 4px;
				padding: 2px 0;
				text-align: center;
				letter-spacing: 0;
			}

			.name {
				font-family: var(--dg-mono);
				font-size: var(--dg-ui-sm);
				letter-spacing: -0.01em;
				color: var(--dg-fg-strong);
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				/* A filename is the one thing here worth copying out */
				user-select: text;
				-webkit-user-select: text;
				cursor: text;
			}

			.target {
				font-family: var(--dg-font);
				font-size: var(--dg-ui-xs);
				font-variation-settings: var(--dg-var-ui);
				color: var(--dg-fg-faint);
				white-space: nowrap;
			}

			.status {
				font-family: var(--dg-font);
				font-size: var(--dg-ui-sm);
				font-variation-settings: var(--dg-var-ui);
				color: var(--dg-fg-soft);
				text-align: right;
				white-space: nowrap;
				min-width: 7.5em;
			}

			.status.done {
				color: var(--dg-ok);
			}
			.status.failed {
				color: var(--dg-bad);
			}
			.status.running {
				color: #9dc2ff;
			}

			button.status {
				background: transparent;
				border: 0;
				padding: 2px 4px;
				border-radius: 4px;
				cursor: pointer;
				font: inherit;
				font-size: var(--dg-ui-sm);
			}

			button.status:hover {
				background: rgba(255, 255, 255, 0.1);
				color: var(--dg-fg-strong);
			}

			button.status:focus-visible {
				outline: 2px solid var(--dg-accent-ring);
				outline-offset: 1px;
			}

			.why {
				grid-column: 2 / -1;
				font-family: var(--dg-mono);
				font-size: var(--dg-ui-xs);
				color: var(--dg-bad-soft);
				letter-spacing: 0;
				margin-top: 3px;
				overflow: hidden;
				text-overflow: ellipsis;
				white-space: nowrap;
				user-select: text;
				-webkit-user-select: text;
			}
		`,
	];

	constructor() {
		super();
		new StoreController(this);
	}

	render() {
		const files = store.files;
		if (files.length === 0) return nothing;

		return html`
			<div class="head">
				<span>${this._headline()}</span>
				<span>${this._targetSummary()}</span>
			</div>
			<div class="scroller" role="list">
				${repeat(
					files,
					(f) => f.path,
					(f) => this._row(f)
				)}
			</div>
		`;
	}

	_row(f) {
		const label = STATUS_LABEL[f.status] || f.status;
		const isDone = f.status === "done" && f.outputFile;

		return html`
			<div class="row ${f.status}" role="listitem">
				<span class="badge">${f.ext || "—"}</span>
				<span class="name" title=${f.path}>${f.name}</span>
				<span class="target">${f.status === "skipped" ? "" : `→ ${store.formatLabel}`}</span>
				${isDone
					? html`<button
							class="status done"
							title="Show ${f.name} in the file manager"
							@click=${() => this._reveal(f.path)}
						>
							Reveal
						</button>`
					: html`<span class="status ${f.status}">${label}</span>`}
				${f.status === "failed" && f.error
					? html`<span class="why" title=${f.error}>${f.error}</span>`
					: nothing}
			</div>
		`;
	}

	_headline() {
		const { done, total } = store.progress;
		switch (store.mode) {
			case "processing":
				return `Desqueezing ${Math.min(done + 1, total)} of ${total}`;
			case "success":
				return `${store.result?.successCount ?? done} images desqueezed`;
			case "error": {
				const failed = store.failedFiles.length;
				return `${(store.result?.successCount ?? 0)} desqueezed · ${failed} failed`;
			}
			default: {
				const skipped = store.files.length - total;
				const base = `${total} ${total === 1 ? "file" : "files"} queued`;
				return skipped > 0 ? `${base} · ${skipped} already desqueezed` : base;
			}
		}
	}

	_targetSummary() {
		if (store.mode === "success" || store.mode === "error") {
			const s = store.result?.elapsed;
			return s === undefined ? "" : `${s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(2)}s`}`;
		}
		return `Output · ${store.formatLabel} at ${store.factorLabel}`;
	}

	_reveal(path) {
		this.dispatchEvent(
			new CustomEvent("reveal", { detail: { path }, bubbles: true, composed: true })
		);
	}
}

customElements.define("dg-file-list", DgFileList);
