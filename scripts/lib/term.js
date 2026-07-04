/**
 * Shared terminal styling for the setup/dist scripts.
 */

export const DIM = "\x1b[2m";
export const BOLD = "\x1b[1m";
export const CYAN = "\x1b[36m";
export const GREEN = "\x1b[32m";
export const YELLOW = "\x1b[33m";
export const RED = "\x1b[31m";
export const RESET = "\x1b[0m";

export function heading(step, text) {
	console.log(`\n${CYAN}${BOLD}Step ${step}${RESET} ${DIM}·${RESET} ${text}\n`);
}
