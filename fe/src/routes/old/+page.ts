import { redirect } from '@sveltejs/kit';

export const ssr = false;

/** Retired — legacy Three.js editor removed; use `/scene`. */
export function load() {
	redirect(308, '/scene');
}
