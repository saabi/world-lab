import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defaultClientConditions, defineConfig } from 'vite';
import { glslify } from './vite-glslify';
import { wgsl } from './vite-wgsl';

export default defineConfig({
	envPrefix: ['VITE_', 'PUBLIC_'],
	// This app always consumes @world-lab/* workspace packages via live TS source
	// (the "development" export condition), in both dev and production builds —
	// never the published dist/ output. Otherwise `vite build` would switch to
	// the dist-based "import" condition (Vite's default 'development|production'
	// pseudo-condition only resolves to 'development' in dev/test), requiring a
	// packages/*/dist prebuild this app shouldn't depend on. See the same note in
	// apps/webgputoy/vite.config.ts.
	resolve: { conditions: ['development', ...defaultClientConditions] },
	plugins: [
		sveltekit({
			// Transpile TS in node_modules .svelte (e.g. @xyflow) before Rolldown parses them.
			// See sveltejs/vite-plugin-svelte#1360; fixed in svelte 5.56.4+.
			preprocess: vitePreprocess({ script: true }),
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => {
					if (filename.split(/[/\\]/).includes('node_modules')) return undefined;
					return true;
				}
			},
			adapter: adapter()
		}),
		glslify(),
		wgsl()
	],
	// @xyflow/svelte ships .svelte sources; Rolldown dep-prebundle parses them as JS.
	optimizeDeps: {
		exclude: ['@xyflow/svelte', '@xyflow/system']
	},
	// Workspace packages use .ts sources with .js import specifiers; bundle them in SSR
	// so Vite resolves relatives instead of Node looking for missing .js files on disk.
	ssr: {
		noExternal: [/^@world-lab\//],
		// graph-editor imports xyflow; keep xyflow external so SSR does not parse .svelte as JS.
		external: ['@xyflow/svelte', '@xyflow/system'],
		// SSR resolution does NOT inherit the root `resolve.conditions` in practice
		// (verified empirically) — must be set here explicitly too, or a production
		// build fails to resolve @world-lab/* packages.
		resolve: { conditions: ['development', ...defaultClientConditions] }
	}
});
