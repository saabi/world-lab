import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { validateGraph, type GraphDocument } from '@world-lab/graph';
import { dedupeGraphIds, mintEdgeId, mintNodeId } from './graphIds.js';
import { parseGraphFile } from './documentStorage.js';

describe('@world-lab/graph-editor graphIds', () => {
	it('mintNodeId skips ids already present on the doc', () => {
		const used = new Set(['n_noise_worley2d_1', 'n_noise_worley2d_4', 'n_other']);
		expect(mintNodeId(used, 'noise.worley2d')).toBe('n_noise_worley2d_5');
	});

	it('mintEdgeId skips ids already present on the doc', () => {
		const used = new Set(['e_1', 'e_2', 'e_7']);
		expect(mintEdgeId(used)).toBe('e_8');
	});

	it('dedupeGraphIds re-ids duplicate node ids', () => {
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
					id: 'n_a',
					primitive: 'constant.f32',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [],
		};

		const deduped = dedupeGraphIds(doc);
		expect(deduped.nodes.map((node) => node.id)).toEqual(['n_a', 'n_constant_f32_1']);
		expect(validateGraph(deduped).ok).toBe(true);
	});

	it('dedupeGraphIds re-ids duplicate edge ids', () => {
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
				},
				{
					id: 'n_c',
					primitive: 'math.remap',
					inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [
				{
					id: 'e_2',
					from: { node: 'n_a', port: 'value' },
					to: { node: 'n_b', port: 'x' }
				},
				{
					id: 'e_2',
					from: { node: 'n_a', port: 'value' },
					to: { node: 'n_c', port: 'x' }
				}
			],
			outputs: [],
		};

		const deduped = dedupeGraphIds(doc);
		expect(deduped.edges.map((edge) => edge.id)).toEqual(['e_2', 'e_3']);
		expect(validateGraph(deduped).ok).toBe(true);
	});

	it('parseGraphFile dedupes duplicate ids from uploaded JSON', () => {
		const raw = JSON.stringify({
			version: '2',
			nodes: [
				{
					id: 'n_a',
					primitive: 'constant.f32',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_a',
					primitive: 'constant.f32',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [],
		});
		const parsed = parseGraphFile(raw);
		expect(parsed.nodes.map((node) => node.id)).toEqual(['n_a', 'n_constant_f32_1']);
		expect(validateGraph(parsed).ok).toBe(true);
	});
});
