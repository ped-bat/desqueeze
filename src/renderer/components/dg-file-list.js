import { LitElement, html, css, nothing } from "lit";
import { repeat } from "lit/directives/repeat.js";
import { typography } from "../styles/typography.css.js";
import { effects } from "../styles/effects.css.js";
import { store, StoreController } from "../state/app-state.js";
import { stepSpringTo } from "../core/easing.js";

/**
 * Hover spring for the remove control. Stiff and close to critically damped
 * (omega ~14.8 rad/s, zeta ~0.88): quick, with just enough give to feel
 * physical and almost no overshoot.
 */
const HOVER_SPRING = { stiffness: 220, damping: 26 };

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

			/* [light] [format] [name] [action] [status]
			   The action (Reveal, or its invisible stand-in) sits between the
			   filename and the status word rather than after it, so the status
			   word ends at the row's edge in every state and the space held
			   for the button reads as the gap between name and status. */
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

			/* The cross beside "Failed". Its spacing is the icon's own margin
			   rather than the row's gap, so a status without an icon sits
			   exactly where one with an icon does. */
			.ico {
				width: 13px;
				height: 13px;
				flex: none;
				display: block;
				margin-right: 0.4em;
			}

			.reveal {
				justify-self: end;
			}

			/* Until a row has finished, an invisible twin of its Reveal button
			   holds the button's exact box. The action column sizes to its
			   content, so a button appearing on "Done" used to widen it by 68px
			   — shifting the filename's clipping edge — and, being taller than
			   the text beside it, grow the row by 8px and shove every row below
			   it down. Reserving the real thing, rather than a guessed height
			   and width, keeps both dimensions the same in every state, and
			   tracks any future change to the button's size for free. */
			.reveal.ghost {
				visibility: hidden;
				pointer-events: none;
			}

			/* ── Remove ──────────────────────────────────────────────
			   An X on the row's right edge, resting off-stage and sliding in
			   under the cursor. The status word steps aside to make room
			   rather than being covered, so the row reads as opening up for
			   the control instead of swapping one label for another. Revealed
			   on focus-within too, so it is reachable without a mouse. */
			.rm {
				position: absolute;
				right: 9px;
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
				pointer-events: none;
				/* Driven by the spring below, not by a transition: --rm-t runs
				   0 (away) to 1 (revealed) and both properties read it, so an
				   interrupted reveal keeps its velocity instead of restarting
				   a fixed-duration curve. */
				opacity: var(--rm-t, 0);
				transform: translateY(-50%) translateX(calc((1 - var(--rm-t, 0)) * 7px));
				transition:
					background 0.14s ease,
					color 0.14s ease;
			}

			.rm svg {
				width: 11px;
				height: 11px;
				display: block;
			}

			/* The tap target is bigger than the 22px box that draws: it spans
			   the row's full height and runs to the row's edge. It stops short
			   on the left so it never sits over the status word, which steps
			   aside by 24px when the X is revealed. Only the box and its hover
			   wash stay 22px. */
			.rm::before {
				content: "";
				position: absolute;
				top: -12px;
				bottom: -12px;
				left: -6px;
				right: -12px;
			}

			.rm:hover {
				background: rgba(255, 255, 255, 0.1);
				color: var(--dg-fg-strong);
			}

			.rm:focus-visible {
				outline: 2px solid var(--dg-accent-ring);
				outline-offset: 1px;
			}

			/* Steps aside by exactly the X's width plus its gutter, so the word
			   lands clear of it rather than merely somewhere to the left. */
			.row.removable .status {
				transform: translateX(calc(var(--rm-t, 0) * -24px));
			}

			/* Hover still governs whether the control can be clicked; the
			   spring only governs how it looks getting there. */
			.row.removable:hover .rm,
			.row.removable:focus-within .rm {
				pointer-events: auto;
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
		/** path -> {value, vel}; one spring per row, kept across renders */
		this._springs = new Map();
		this._active = null; // path currently hovered or focused
		this._raf = 0;
		this._last = 0;
	}

	disconnectedCallback() {
		super.disconnectedCallback();
		if (this._raf) cancelAnimationFrame(this._raf);
		this._raf = 0;
	}

	/** A row gained or lost the pointer (or focus). */
	_point(path, on) {
		if (on) this._active = path;
		else if (this._active === path) this._active = null;
		this._drive();
	}

	/**
	 * Run the springs until every row has settled, then stop. Retargeting a
	 * spring mid-flight is exactly the case this exists for, so there is no
	 * state to reset when the pointer crosses a row twice in quick
	 * succession — the same spring simply gets a new target.
	 */
	_drive() {
		if (this._raf) return;

		const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
		this._last = performance.now();

		const frame = (now) => {
			// Clamped: a backgrounded window can hand back a huge delta, and
			// integrating that in one step throws the spring across the screen.
			const dt = Math.min((now - this._last) / 1000, 0.05);
			this._last = now;

			let running = false;
			for (const row of this.renderRoot.querySelectorAll(".row.removable")) {
				const path = row.dataset.path;
				let spring = this._springs.get(path);
				if (!spring) {
					spring = { value: 0, vel: 0 };
					this._springs.set(path, spring);
				}
				const target = this._active === path ? 1 : 0;

				if (reduced) {
					spring.value = target;
					spring.vel = 0;
				} else if (!stepSpringTo(spring, target, HOVER_SPRING, dt)) {
					running = true;
				}
				row.style.setProperty("--rm-t", spring.value.toFixed(4));
			}

			this._raf = running ? requestAnimationFrame(frame) : 0;
		};

		this._raf = requestAnimationFrame(frame);
	}

	updated() {
		// Drop springs for rows that no longer exist, so a long session of
		// queue-and-clear does not accumulate them.
		if (this._springs.size === 0) return;
		const live = new Set(store.files.map((f) => f.path));
		for (const path of this._springs.keys()) {
			if (!live.has(path)) this._springs.delete(path);
		}
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
		// No check on a finished row: the green light on the left and the
		// green "Done" beside it already say so, and the check was a third
		// saying that had to animate itself away again.
		const icon = f.status === "failed" ? CROSS : nothing;
		// Only before the run: once a file has a result, its row is a record
		// of what happened rather than a queue entry.
		const removable = store.mode === "settings";

		return html`
			<div
				class="row ${f.status} ${removable ? "removable" : ""}"
				data-path=${f.path}
				role="listitem"
				@pointerenter=${() => this._point(f.path, true)}
				@pointerleave=${() => this._point(f.path, false)}
				@focusin=${() => this._point(f.path, true)}
				@focusout=${() => this._point(f.path, false)}
			>
				<span class="light" aria-hidden="true"></span>
				<span class="badge">${f.ext || "-"}</span>
				<span class="name" title=${f.path}>${f.name}</span>
				${isDone
					? html`<button
							class="btn btn-quiet btn-sm reveal"
							title="Show ${f.name} in the file manager"
							@click=${() => this._reveal(f.path)}
						>
							Reveal
						</button>`
					: html`<span class="btn btn-quiet btn-sm reveal ghost" aria-hidden="true">Reveal</span>`}
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
