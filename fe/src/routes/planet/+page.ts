import { redirect } from '@sveltejs/kit';

export const ssr = false;

/** Retired — per-body editing lives in `/scene`. */
export function load() {
	redirect(308, '/scene');
}
