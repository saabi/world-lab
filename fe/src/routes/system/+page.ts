import { redirect } from '@sveltejs/kit';

export const ssr = false;

// The system editor moved to the path-addressed /scene/[...path] route.
export function load() {
	redirect(308, '/scene');
}
