import { describe, expect, it } from 'vitest';
import type { GraphDocument } from './types.js';
import { validateGraph } from './validate.js';

function textureIn(id = 'color') {
	return { id, name: id, direction: 'in' as const, dataType: 'texture' as const };
}

function textureOut(id = 'texture') {
	return { id, name: id, direction: 'out' as const, dataType: 'texture' as const };
}

describe('@world-lab/graph validateGraph multiple-inputs', () => {
	it('flags more than one incoming edge on a non-list input', () => {
		const doc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_frag_a',
					primitive: 'stage.fragment',
					inputs: [],
					outputs: [textureOut()]
				},
				{
					id: 'n_frag_b',
					primitive: 'stage.fragment',
					inputs: [],
					outputs: [textureOut()]
				},
				{
					id: 'n_display',
					primitive: 'target.display',
					inputs: [textureIn()],
					outputs: []
				}
			],
			edges: [
				{
					id: 'e_a',
					from: { node: 'n_frag_a', port: 'texture' },
					to: { node: 'n_display', port: 'color' }
				},
				{
					id: 'e_b',
					from: { node: 'n_frag_b', port: 'texture' },
					to: { node: 'n_display', port: 'color' }
				}
			],
			outputs: [],
			consumers: []
		};

		const result = validateGraph(doc);
		expect(result.ok).toBe(false);
		expect(result.issues).toContainEqual({
			kind: 'multiple-inputs',
			node: 'n_display',
			port: 'color',
			count: 2
		});
	});

	it('allows multiple incoming edges on tuple inputs', () => {
		const doc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_a',
					primitive: 'test.source',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_b',
					primitive: 'test.source',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_sum',
					primitive: 'test.listSum',
					inputs: [{ id: 'vals', name: 'vals', direction: 'in', dataType: 'tuple<f32>' }],
					outputs: [{ id: 'out', name: 'out', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [
				{ id: 'e1', from: { node: 'n_a', port: 'value' }, to: { node: 'n_sum', port: 'vals' } },
				{ id: 'e2', from: { node: 'n_b', port: 'value' }, to: { node: 'n_sum', port: 'vals' } }
			],
			outputs: [],
			consumers: []
		};

		const result = validateGraph(doc);
		expect(result.issues.some((issue) => issue.kind === 'multiple-inputs')).toBe(false);
	});
});
