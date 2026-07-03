import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [svelte({ compilerOptions: { runes: true } })],
	resolve: {
		conditions: ['browser']
	},
	test: {
		environment: 'happy-dom',
		include: ['src/**/*.test.ts'],
		// Auto-registers a beforeEach/afterEach pair that unmounts and cleans up the DOM between
		// tests. Without it, multiple render() calls in one file leak into each other whenever a
		// test queries via the global `screen` object (not scoped to a returned `container`).
		setupFiles: ['@testing-library/svelte/vitest']
	}
});
