import { describe, expect, it } from 'vitest';
import type { GraphDocument } from './types.js';
import { validateGraph } from './validate.js';

function docWithDuplicateNodeId(): GraphDocument {
	return {
		version: '2',
		nodes: [
			{
				id: 'n_dup',
				primitive: 'constant.f32',
				inputs: [],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
			},
			{
				id: 'n_dup',
				primitive: 'constant.f32',
				inputs: [],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
			}
		],
		edges: [],
		outputs: [],
	};
}

describe('@world-lab/graph validateGraph duplicate-id', () => {
	it('reports duplicate node ids', () => {
		const result = validateGraph(docWithDuplicateNodeId());
		expect(result.ok).toBe(false);
		expect(result.issues).toContainEqual({
			kind: 'duplicate-id',
			entity: 'node',
			id: 'n_dup'
		});
	});

	it('reports duplicate edge ids', () => {
		const doc: GraphDocument = {
			version: '2',
			nodes: [
				{
					id: 'n_a',
					primitive: 'constant.f32',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_b',
					primitive: 'math.remap',
					inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [
				{ id: 'e_1', from: { node: 'n_a', port: 'value' }, to: { node: 'n_b', port: 'x' } },
				{ id: 'e_1', from: { node: 'n_a', port: 'value' }, to: { node: 'n_b', port: 'x' } }
			],
			outputs: [],
		};
		const result = validateGraph(doc);
		expect(result.ok).toBe(false);
		expect(result.issues).toContainEqual({
			kind: 'duplicate-id',
			entity: 'edge',
			id: 'e_1'
		});
	});
});
