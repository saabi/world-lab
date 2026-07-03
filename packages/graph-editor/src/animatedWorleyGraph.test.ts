import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import {
	effectiveConsumers,
	effectiveGraphDocument,
	validateGraph,
	validateGraphFull
} from '@world-lab/graph';

import { animatedWorleyPipelineGraph } from './graphBuilders.js';
import { enumeratePreviewBuffers } from './previewBuffers.js';

describe('animatedWorleyPipelineGraph', () => {
	it('is a valid two-target animated noise pipeline with unique ids', () => {
		const graph = animatedWorleyPipelineGraph();
		expect(validateGraph(graph).ok).toBe(true);
		expect(validateGraphFull(graph).ok).toBe(true);

		// unique node + edge ids (the pasted graph had duplicates; the corrected sample must not)
		const nodeIds = graph.nodes.map((node) => node.id);
		expect(new Set(nodeIds).size).toBe(nodeIds.length);
		const edgeIds = graph.edges.map((edge) => edge.id);
		expect(new Set(edgeIds).size).toBe(edgeIds.length);

		// two independent fragment → display chains
		const displays = graph.nodes.filter((node) => node.primitive === 'target.display');
		expect(displays.map((node) => node.id).sort()).toEqual(['n_display', 'n_target_display_1']);
		const fragments = graph.nodes.filter((node) => node.primitive === 'stage.fragment');
		expect(fragments).toHaveLength(2);
	});

	it('wires the worley + perlin field into vec4f_2 and perlin3d into vec4f_3', () => {
		const graph = animatedWorleyPipelineGraph();
		expect(graph.edges.find((edge) => edge.id === 'e_worley_v4_2x')?.to).toEqual({
			node: 'n_vector_vec4f_2',
			port: 'x'
		});
		expect(graph.edges.find((edge) => edge.id === 'e_perlin3d_v4_3z')?.to).toEqual({
			node: 'n_vector_vec4f_3',
			port: 'z'
		});
		expect(graph.nodes.find((node) => node.id === 'n_constant_f32_5')?.params).toEqual({
			value: 0.02
		});
	});

	it('enumerates one image preview buffer per display sink', () => {
		const graph = animatedWorleyPipelineGraph();
		const buffers = enumeratePreviewBuffers(graph);
		expect(buffers.filter((buffer) => buffer.family === 'image').map((buffer) => buffer.id).sort()).toEqual(
			['n_display', 'n_target_display_1']
		);

		const effective = effectiveGraphDocument(graph);
		const imageConsumers = effectiveConsumers(effective).filter(
			(consumer) => consumer.type === 'image'
		);
		expect(imageConsumers).toHaveLength(2);
		expect(new Set(imageConsumers.map((consumer) => consumer.id)).size).toBe(2);
		expect(new Set(effective.outputs.map((output) => output.name)).size).toBe(2);

		const effectiveBuffers = enumeratePreviewBuffers(effective);
		expect(effectiveBuffers.filter((buffer) => buffer.family === 'image')).toHaveLength(2);
	});
});
