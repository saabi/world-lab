import '@world-lab/graph';
import { Type } from '@world-lab/schema';
import { describe, expect, it } from 'vitest';
import { getPrimitive, listPrimitives } from '@world-lab/graph';

import { generateInspectorSummary, resolveNodeInspectorHelp } from './nodeInspectorHelp.js';
import { getDefaultPrimitiveSource } from './primitiveSources.js';

describe('resolveNodeInspectorHelp', () => {
	it('prefers help over description for the summary', () => {
		const primitive = getPrimitive('math.min')!;
		expect(resolveNodeInspectorHelp(primitive).summary).toContain('SDF union');
	});

	it('includes usage when present', () => {
		const help = resolveNodeInspectorHelp(getPrimitive('sdf.opSubtract')!);
		expect(help.usage).toBeTruthy();
	});

	it('falls back to description when help is absent', () => {
		const help = resolveNodeInspectorHelp({
			id: 'test.node',
			category: 'test',
			inputs: [],
			outputs: [],
			params: Type.Object({}),
			implementation: { kind: 'wgsl-function', moduleId: 'test.node', entry: 'test' },
			wgsl: { moduleId: 'test.node', entry: 'test' },
			metadata: { description: 'A test primitive.' }
		});
		expect(help.summary).toBe('A test primitive.');
	});

	it('generates a port-type summary when help and description are absent', () => {
		const primitive = {
			id: 'noise.worley2d',
			category: 'noise',
			inputs: [{ name: 'position', dataType: 'vec2f' as const }],
			outputs: [{ name: 'value', dataType: 'f32' as const }],
			params: Type.Object({}),
			implementation: {
				kind: 'wgsl-function' as const,
				moduleId: 'noise.worley2d',
				entry: 'worley2d'
			},
			wgsl: { moduleId: 'noise.worley2d', entry: 'worley2d' }
		};
		expect(generateInspectorSummary(primitive)).toBe('noise primitive · vec2f → f32');
		expect(resolveNodeInspectorHelp(primitive).summary).toBe('noise primitive · vec2f → f32');
	});

	it('every registered primitive resolves non-empty inspector help', () => {
		for (const primitive of listPrimitives()) {
			const { summary } = resolveNodeInspectorHelp(primitive);
			expect(summary.length, primitive.id).toBeGreaterThan(0);
		}
	});

	it('noise.worley2d uses authored help, not the generated fallback', () => {
		const primitive = getPrimitive('noise.worley2d')!;
		const { summary } = resolveNodeInspectorHelp(primitive);
		expect(summary).toContain('Worley');
		expect(summary).not.toMatch(/noise primitive ·/);
	});

	it('math.add help appears in synthesized frontmatter', () => {
		const source = getDefaultPrimitiveSource('math.add');
		expect(source).toContain('help:');
		expect(source).toContain('Sum of two scalars');
	});
});
