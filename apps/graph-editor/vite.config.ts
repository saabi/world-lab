import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			preprocess: vitePreprocess({ script: true }),
			compilerOptions: {
				runes: ({ filename }) => {
					if (filename.split(/[/\\]/).includes('node_modules')) return undefined;
					return true;
				}
			},
			adapter: adapter()
		})
	],
	optimizeDeps: {
		exclude: ['@xyflow/svelte', '@xyflow/system']
	},
	ssr: {
		noExternal: [/^@virtual-planet\//],
		external: ['@xyflow/svelte', '@xyflow/system']
	}
});
