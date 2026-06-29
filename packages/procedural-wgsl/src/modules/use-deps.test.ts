import { describe, expect, it } from 'vitest';
import { STANDARD_LIBRARY_MODULES } from './index.js';

// Regression guard (M-node-model-foundation review): a raw library module's `// @use`
// comments are INERT — codegen pulls module deps from the `dependencies` field, not from
// source comments. So a module whose source contains `@use X` but does not list `X` in
// `dependencies` will emit calls to an undefined `X` → invalid WGSL on GPU (which headless
// tests do not catch). A composed/group module must declare its deps (via the M3 @use
// loader → dependencies), or stay atomic. This caught the remap/opSubtract decomposition.
describe('procedural-wgsl @use directives are backed by declared dependencies', () => {
	for (const [id, mod] of Object.entries(STANDARD_LIBRARY_MODULES)) {
		const uses = [...mod.source.matchAll(/^\s*\/\/\s*@use\s+([\w.]+)/gm)].map((m) => m[1]!);
		if (uses.length === 0) continue;
		it(`${id}: every @use is in dependencies`, () => {
			const deps = new Set(mod.dependencies ?? []);
			for (const used of uses) expect(deps.has(used), `${id} uses ${used} but does not declare it`).toBe(true);
		});
	}
	it('runs (the module set is non-empty)', () => {
		expect(Object.keys(STANDARD_LIBRARY_MODULES).length).toBeGreaterThan(10);
	});
});
