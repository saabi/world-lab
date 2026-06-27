import { generateWgsl, sliceGraph } from '@virtual-planet/compiler';
import { describe, expect, it } from 'vitest';

import { createStandardLibraryResolver, STANDARD_LIBRARY_MODULES } from './moduleResolver.js';

describe('@virtual-planet/runtime-webgpu moduleResolver', () => {
	it('re-exports the procedural-wgsl standard library', () => {
		expect(STANDARD_LIBRARY_MODULES['noise.perlin3d']?.source).toContain('fn perlin3d(');
		expect(STANDARD_LIBRARY_MODULES['math.add']?.source).toContain('fn add(');
	});

	it('generateWgsl resolves default preview-graph modules from the standard library', async () => {
		const graph = {
			version: '1' as const,
			nodes: [
				{
					id: 'n_uv',
					primitive: 'procedural.uv',
					position: { x: 0, y: 0 },
					inputs: [],
					outputs: [{ id: 'uv', name: 'uv', direction: 'out' as const, dataType: 'vec2f' as const, space: 'none' as const }]
				},
				{
					id: 'n_perlin',
					primitive: 'noise.perlin3d',
					position: { x: 0, y: 0 },
					inputs: [
						{
							id: 'position',
							name: 'position',
							direction: 'in' as const,
							dataType: 'vec3f' as const,
							space: 'none' as const
						}
					],
					outputs: [
						{
							id: 'value',
							name: 'value',
							direction: 'out' as const,
							dataType: 'f32' as const,
							space: 'none' as const
						}
					]
				},
				{
					id: 'n_remap',
					primitive: 'math.remap',
					position: { x: 0, y: 0 },
					inputs: [
						{ id: 'x', name: 'x', direction: 'in' as const, dataType: 'f32' as const, space: 'none' as const }
					],
					outputs: [
						{ id: 'value', name: 'value', direction: 'out' as const, dataType: 'f32' as const, space: 'none' as const }
					],
					params: { inMin: -1, inMax: 1, outMin: 0, outMax: 1 }
				}
			],
			edges: [
				{
					id: 'e1',
					from: { node: 'n_uv', port: 'uv' },
					to: { node: 'n_perlin', port: 'position' }
				},
				{
					id: 'e2',
					from: { node: 'n_perlin', port: 'value' },
					to: { node: 'n_remap', port: 'x' }
				}
			],
			outputs: [{ name: 'field', from: { node: 'n_remap', port: 'value' } }],
			consumers: [{ type: 'preview', outputs: ['field'] }]
		};

		const slice = sliceGraph(graph, { outputs: ['field'] });
		const generated = await generateWgsl(slice, createStandardLibraryResolver());

		expect(generated.moduleIds).toContain('noise.perlin3d');
		expect(generated.moduleIds).toContain('math.remap');
		expect(generated.code).toContain('fn perlin3d(');
		expect(generated.code).toContain('const PERM:');
		expect(generated.code).not.toContain('hash_mix');
	});
});
