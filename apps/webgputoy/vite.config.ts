import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defaultClientConditions, defineConfig } from 'vite';

export default defineConfig({
	// Single shared dev server on 5173. strictPort makes a second `npm run dev`
	// fail loudly (port in use) instead of silently spawning 5174, 5175, … —
	// reuse the running one at http://localhost:5173 (see AGENTS.md §Dev server).
	server: { port: 5173, strictPort: true },
	// This app always consumes @world-lab/* workspace packages via their live TS
	// source (the "development" export condition), in BOTH dev and production
	// builds — never their published dist/ output. That's a deliberate choice:
	// this app is part of the monorepo, not an external npm consumer, so it
	// shouldn't need a `packages/*` prebuild step. Vite's default conditions
	// resolve to 'development' automatically in dev/test (the special
	// 'development|production' pseudo-condition), but a real `vite build` would
	// otherwise switch to 'production' -> the dist-based "import" condition,
	// which requires packages/*/dist to exist. Forcing the literal 'development'
	// condition here keeps app builds decoupled from package publish-readiness.
	resolve: { conditions: ['development', ...defaultClientConditions] },
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
		noExternal: [/^@world-lab\//],
		external: ['@xyflow/svelte', '@xyflow/system'],
		// SSR resolution does NOT inherit the root `resolve.conditions` in practice
		// (verified empirically) — must be set here explicitly too, or a production
		// build fails to resolve @world-lab/* packages.
		resolve: { conditions: ['development', ...defaultClientConditions] }
	}
});
