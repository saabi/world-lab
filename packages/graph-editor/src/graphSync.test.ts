import { describe, expect, it } from 'vitest';
import { getPrimitive, registerPrimitive, type GraphDocument } from '@world-lab/graph';
import { Type } from '@world-lab/schema';
import { repairStalePortRefs, resyncGraphPortMetadata } from './graphSync.js';
import { defaultPreviewGraph } from './defaultGraph.js';

describe('@world-lab/graph-editor graphSync', () => {
	it('repairs a single-output edge after the port name changes on the node', () => {
		const doc = defaultPreviewGraph();
		const perlin = doc.nodes.find((node) => node.id === 'n_perlin')!;
		const renamed = {
			...doc,
			nodes: doc.nodes.map((node) =>
				node.id === 'n_perlin'
					? {
							...node,
							outputs: [{ ...perlin.outputs[0]!, id: 'noise', name: 'noise' }]
						}
					: node
			)
		};

		const repaired = repairStalePortRefs(renamed);
		expect(repaired.edges.find((edge) => edge.id === 'e_perlin_remap')?.from.port).toBe('noise');
	});

	it('restores canonical semantic tags from primitive port specs', () => {
		const primitiveId = 'test.semantic-resync';
		if (!getPrimitive(primitiveId)) {
			registerPrimitive({
				id: primitiveId,
				category: 'test',
				inputs: [],
				outputs: [
					{
						name: 'value',
						dataType: 'f32',
						space: 'stereo_field',
						semantics: ['unit:m', 'color:linear-srgb', 'unit:m']
					}
				],
				params: Type.Object({}),
				wgsl: { moduleId: primitiveId, entry: 'semanticResync' }
			});
		}
		const doc: GraphDocument = {
			version: '2',
			nodes: [
				{
					id: 'n_semantic',
					primitive: primitiveId,
					inputs: [],
					outputs: [
						{
							id: 'value',
							name: 'value',
							direction: 'out',
							dataType: 'f32',
							semantics: ['stale']
						}
					]
				}
			],
			edges: [],
			outputs: [],
		};

		expect(resyncGraphPortMetadata(doc).nodes[0]?.outputs[0]).toMatchObject({
			space: 'stereo_field',
			semantics: ['color:linear-srgb', 'unit:m']
		});
	});
});
