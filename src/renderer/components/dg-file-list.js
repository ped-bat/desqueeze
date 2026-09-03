import { LitElement, html, css, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { typography } from "../styles/typography.css.js";
import { effects } from "../styles/effects.css.js";
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

/** Drawn rather than typed: Science Gothic has no check or cross glyph, so
 *  a text ✓ would silently fall back to another family mid-row. */
const CHECK = html`<svg class="ico" viewBox="0 0 16 16" aria-hidden="true">
	<path d="M3.2 8.6l3.1 3.1 6.5-7" fill="none" stroke="currentColor" stroke-width="2.1"
		stroke-linecap="round" stroke-linejoin="round" />
</svg>`;

const CROSS = html`<svg class="ico" viewBox="0 0 16 16" aria-hidden="true">
	<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" fill="none" stroke="currentColor" stroke-width="2.1"
		stroke-linecap="round" />
</svg>`;

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
		effects,
		css`
			:host {
				display: flex;
				flex-direction: column;
				min-height: 0;
				flex: 1;
				gap: 10px;
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
				padding: 2px 4px 0;
			}

			.scroller {
				flex: 1;
				min-height: 0;
				overflow-y: auto;
				overscroll-behavior: contain;
				display: flex;
				flex-direction: column;
				gap: 3px;
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

			/* [light] [format] [name] [target] [status] [action] */
			.row {
				position: relative;
				/* Rows keep their natural height. As flex children in a
				   column they would otherwise shrink to fit once the batch
				   outgrew the scroller, and the content would overlap the
				   row below instead of scrolling. */
				flex: none;
				display: grid;
				grid-template-columns: 10px 3.6em minmax(0, 1fr) auto auto auto;
				align-items: center;
				gap: 12px;
				padding: 9px 14px;
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
					var(--dg-wait-wash),
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
					background: var(--dg-wait-wash);
					background-size: 100% 100%;
				}
			}

			.row.failed {
				background: var(--dg-bad-wash);
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
				display: inline-flex;
				align-items: center;
				justify-content: flex-end;
				gap: 0.4em;
				font-family: var(--dg-font);
				font-size: var(--dg-ui-sm);
				font-variation-settings: var(--dg-var-ui);
				color: var(--dg-fg-soft);
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
				color: var(--dg-wait-soft);
			}

			/* ── The traffic light ──────────────────────────────────
			   Leftmost column, same place on every row, so the state of a
			   long batch reads as a vertical strip of colour before any
			   word is read: grey waiting, amber working, green done, red
			   failed. Shape carries it too — waiting is a hollow ring,
			   settled states are filled — so it survives colour blindness
			   and the status word beside it names it outright. */
			.light {
				width: 10px;
				height: 10px;
				border-radius: 50%;
				box-sizing: border-box;
				border: 1.5px solid var(--dg-pending);
				background: transparent;
			}

			.row.running .light {
				border-color: var(--dg-wait);
				background: var(--dg-wait);
				animation: dg-pulse 1.15s ease-in-out infinite;
			}

			.row.done .light {
				border-color: var(--dg-ok);
				background: var(--dg-ok);
			}

			.row.failed .light {
				border-color: var(--dg-bad);
				background: var(--dg-bad);
			}

			.row.cancelled .light,
			.row.skipped .light {
				border-color: var(--dg-pending);
				background: var(--dg-pending);
			}

			@keyframes dg-pulse {
				0%,
				100% {
					opacity: 1;
				}
				50% {
					opacity: 0.35;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.row.running .light {
					animation: none;
				}
			}

			/* The check is the confirming half of "Done" */
			.ico {
				width: 13px;
				height: 13px;
				flex: none;
				display: block;
			}

			.reveal {
				justify-self: end;
			}

			/* Holds the action column open on rows with no button, so the
			   status words stay in one line down the list. */
			.noact {
				width: 0;
			}

			.why {
				grid-column: 3 / -1;
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
		const icon = f.status === "done" ? CHECK : f.status === "failed" ? CROSS : nothing;

		return html`
			<div class="row ${f.status}" role="listitem">
				<span class="light" aria-hidden="true"></span>
				<span class="badge">${f.ext || "-"}</span>
				<span class="name" title=${f.path}>${f.name}</span>
				<span class="target">${f.status === "skipped" ? "" : `→ ${store.formatLabel}`}</span>
				<span class="status ${f.status}">${icon}${label}</span>
				${isDone
					? html`<button
							class="btn btn-quiet btn-sm reveal"
							title="Show ${f.name} in the file manager"
							@click=${() => this._reveal(f.path)}
						>
							Reveal
						</button>`
					: html`<span class="noact"></span>`}
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

	/** Elapsed time once a run has finished, and nothing before it. The
	 *  factor and format used to be restated here, but the top bar chip
	 *  carries them permanently — saying it twice on the same screen made
	 *  neither copy authoritative. */
	_targetSummary() {
		if (store.mode !== "success" && store.mode !== "error") return "";
		const s = store.result?.elapsed;
		if (s === undefined) return "";
		return s < 1 ? `${(s * 1000).toFixed(0)}ms` : `${s.toFixed(2)}s`;
	}

	_reveal(path) {
		this.dispatchEvent(
			new CustomEvent("reveal", { detail: { path }, bubbles: true, composed: true })
		);
	}
}

customElements.define("dg-file-list", DgFileList);
