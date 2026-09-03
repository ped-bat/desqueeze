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
const CHECK = html`<svg class="ico ico-check" viewBox="0 0 16 16" aria-hidden="true">
	<path d="M3.2 8.6l3.1 3.1 6.5-7" fill="none" stroke="currentColor" stroke-width="2.1"
		stroke-linecap="round" stroke-linejoin="round" />
</svg>`;

const CROSS = html`<svg class="ico" viewBox="0 0 16 16" aria-hidden="true">
	<path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" fill="none" stroke="currentColor" stroke-width="2.1"
		stroke-linecap="round" />
</svg>`;

/** The remove control's X — lighter stroke than the status cross above, which
 *  is reporting a failure rather than offering an action. */
const EX = html`<svg viewBox="0 0 16 16" aria-hidden="true">
	<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.7"
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
 * @fires remove - CustomEvent<{path:string}> to drop one file before the run
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
				grid-template-columns: 10px 3.6em minmax(0, 1fr) auto auto;
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

			.status {
				display: inline-flex;
				align-items: center;
				justify-content: flex-end;
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

			/* The check is the confirming half of "Done".
			   Spacing is the icon's own margin rather than the row's gap, so
			   the check can collapse the space it occupies as it leaves and
			   "Done" settles without a jump. */
			.ico {
				width: 13px;
				height: 13px;
				flex: none;
				display: block;
				margin-right: 0.4em;
			}

			/* The check draws itself on, holds, then retires: the light on the
			   left is the lasting record of a finished row, so a permanent
			   check beside it was saying the same thing twice. The cross does
			   not retire — a failure has to stay stated. */
			.ico-check path {
				stroke-dasharray: 15;
				stroke-dashoffset: 15;
				animation: dg-draw 0.4s cubic-bezier(0.65, 0, 0.35, 1) forwards;
			}

			.ico-check {
				animation: dg-check-retire 0.3s ease 2s forwards;
			}

			@keyframes dg-draw {
				to {
					stroke-dashoffset: 0;
				}
			}

			@keyframes dg-check-retire {
				to {
					opacity: 0;
					width: 0;
					margin-right: 0;
				}
			}

			@media (prefers-reduced-motion: reduce) {
				.ico-check path {
					animation: none;
					stroke-dashoffset: 0;
				}
				.ico-check {
					animation: none;
				}
			}

			.reveal {
				justify-self: end;
			}

			/* ── Remove ──────────────────────────────────────────────
			   An X on the row's right edge, resting off-stage and sliding in
			   under the cursor. The status word steps aside to make room
			   rather than being covered, so the row reads as opening up for
			   the control instead of swapping one label for another. Revealed
			   on focus-within too, so it is reachable without a mouse. */
			.rm {
				position: absolute;
				right: 12px;
				top: 50%;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 22px;
				height: 22px;
				padding: 0;
				border: 0;
				border-radius: 5px;
				background: transparent;
				color: var(--dg-fg-soft);
				cursor: pointer;
				opacity: 0;
				pointer-events: none;
				transform: translateY(-50%) translateX(7px);
				transition:
					opacity 0.17s ease,
					transform 0.17s cubic-bezier(0.2, 0, 0.2, 1),
					background 0.14s ease,
					color 0.14s ease;
			}

			.rm svg {
				width: 11px;
				height: 11px;
				display: block;
			}

			.rm:hover {
				background: rgba(255, 255, 255, 0.1);
				color: var(--dg-fg-strong);
			}

			.rm:focus-visible {
				outline: 2px solid var(--dg-accent-ring);
				outline-offset: 1px;
			}

			.row.removable .status {
				transition: transform 0.17s cubic-bezier(0.2, 0, 0.2, 1);
			}

			.row.removable:hover .rm,
			.row.removable:focus-within .rm {
				opacity: 1;
				pointer-events: auto;
				transform: translateY(-50%) translateX(0);
			}

			/* Exactly the X's width plus its gutter, so the word lands clear
			   of it rather than merely somewhere to the left. */
			.row.removable:hover .status,
			.row.removable:focus-within .status {
				transform: translateX(-28px);
			}

			@media (prefers-reduced-motion: reduce) {
				.rm,
				.row.removable .status {
					transition: none;
				}
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
		// Only before the run: once a file has a result, its row is a record
		// of what happened rather than a queue entry.
		const removable = store.mode === "settings";

		return html`
			<div class="row ${f.status} ${removable ? "removable" : ""}" role="listitem">
				<span class="light" aria-hidden="true"></span>
				<span class="badge">${f.ext || "-"}</span>
				<span class="name" title=${f.path}>${f.name}</span>
				<span class="status ${f.status}">${icon}${label}</span>
				${removable
					? html`<button
							class="rm"
							aria-label="Remove ${f.name} from the batch"
							title="Remove ${f.name} from the batch"
							@click=${() => this._remove(f.path)}
						>
							${EX}
						</button>`
					: nothing}
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

	_remove(path) {
		this.dispatchEvent(
			new CustomEvent("remove", { detail: { path }, bubbles: true, composed: true })
		);
	}

	_reveal(path) {
		this.dispatchEvent(
			new CustomEvent("reveal", { detail: { path }, bubbles: true, composed: true })
		);
	}
}

customElements.define("dg-file-list", DgFileList);
