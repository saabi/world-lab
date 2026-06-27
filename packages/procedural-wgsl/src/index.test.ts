import { describe, expect, it } from 'vitest';

import {
	createStandardLibraryResolver,
	PROCEDURAL_WGSL_PACKAGE,
	STANDARD_LIBRARY_MODULES
} from './index.js';

/** Module id → exported entry fn name (matches graph primitive `wgsl.entry`). */
const STANDARD_LIBRARY_ENTRIES: Record<string, string> = {
	'procedural.uv': 'uv',
	'noise.perlin3d': 'perlin3d',
	'noise.worley': 'worley',
	'noise.fbm': 'fbm',
	'math.remap': 'remap',
	'math.clamp': 'clamp',
	'math.smoothstep': 'smoothstep',
	'math.add': 'add',
	'math.multiply': 'multiply',
	'math.mix': 'mix',
	'math.pow': 'pow',
	'surface.plane': 'plane',
	'surface.cubeSphere': 'cubeSphere'
};

describe('@virtual-planet/procedural-wgsl', () => {
	it('exports its package identity', () => {
		expect(PROCEDURAL_WGSL_PACKAGE).toBe('@virtual-planet/procedural-wgsl');
	});

	it('maps every standard-library id to a module with source', () => {
		for (const moduleId of Object.keys(STANDARD_LIBRARY_ENTRIES)) {
			expect(STANDARD_LIBRARY_MODULES[moduleId]?.id).toBe(moduleId);
			expect(STANDARD_LIBRARY_MODULES[moduleId]?.source.length).toBeGreaterThan(0);
		}
	});

	it('createStandardLibraryResolver resolves each id with the expected entry fn', async () => {
		const resolver = createStandardLibraryResolver();

		for (const [moduleId, entry] of Object.entries(STANDARD_LIBRARY_ENTRIES)) {
			const mod = await resolver.resolve(moduleId);
			expect(mod.id).toBe(moduleId);
			expect(mod.source).toContain(`fn ${entry}(`);
		}
	});

	it('createStandardLibraryResolver throws for unknown ids', async () => {
		const resolver = createStandardLibraryResolver();
		await expect(resolver.resolve('missing.module')).rejects.toThrow('Unknown module: missing.module');
	});

	it('noise.fbm declares a dependency on noise.perlin3d', () => {
		expect(STANDARD_LIBRARY_MODULES['noise.fbm']?.dependencies).toEqual(['noise.perlin3d']);
		expect(STANDARD_LIBRARY_MODULES['noise.fbm']?.source).toContain('perlin3d(');
	});
});
