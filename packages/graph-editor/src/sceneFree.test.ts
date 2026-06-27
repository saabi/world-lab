/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest';

// ADR guard: packages/graph-editor edits FIELD GRAPHS only. It must not import the
// planet renderer, the scene tree, or any host-app modules ($lib / $app / fe/). It
// may depend only on the generic @virtual-planet graph stack + UI libs.
// See _docs/architecture/procedural-graph/editor-and-scene-integration.md.

const ALLOWED_VP = /^@virtual-planet\/(graph|schema|compiler|runtime-cpu|runtime-webgpu|subdivide)(\/|$)/;
const FORBIDDEN = /\$(lib|app)|(^|\/)fe\/|(^|\/)(planet|scene)(\/|$)/;
const IMPORT_RE = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\s*['"]([^'"]+)['"]/g;

// Vite/Vitest-native raw source read — no node builtins (packages stay browser-capable).
const sources = import.meta.glob('./**/*.{ts,svelte}', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('graph-editor stays scene-free (ADR: editor-and-scene-integration)', () => {
	it('imports no planet/scene/host-app modules', () => {
		expect(Object.keys(sources).length).toBeGreaterThan(10); // guard actually scanned the package
		const offenders: string[] = [];
		for (const [file, src] of Object.entries(sources)) {
			if (file.endsWith('.test.ts')) continue;
			for (const m of src.matchAll(IMPORT_RE)) {
				const spec = m[1] ?? m[2];
				if (!spec || ALLOWED_VP.test(spec)) continue;
				if (FORBIDDEN.test(spec)) offenders.push(`${file}: ${spec}`);
			}
		}
		expect(offenders).toEqual([]);
	});
});
