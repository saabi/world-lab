import { describe, expect, it } from 'vitest';
import { effectiveConsumers, validateGraph } from '@world-lab/graph';
import { cosinePaletteEffectGraph } from './graphBuilders.js';

describe('cosinePaletteEffectGraph', () => {
	it('wires the ShaderToy sample as an explicit source-to-target pipeline', () => {
		const graph = cosinePaletteEffectGraph();
		expect(validateGraph(graph).ok).toBe(true);
		expect(graph.nodes.map((node) => node.primitive)).toEqual([
			'geometry.plane',
			'buffer.persist',
			'stage.vertex',
			'stage.fragment',
			'target.display',
			'host.fragCoord',
			'host.iResolution',
			'host.iTime',
			'effect.cosinePalette'
		]);
		expect(graph.edges.map((edge) => edge.id)).toEqual([
			'e_plane_persist',
			'e_persist_vertex',
			'e_vertex_fragment',
			'e_frag_effect',
			'e_res_effect',
			'e_time_effect',
			'e_effect_fragment',
			'e_fragment_display'
		]);

		const planePersist = graph.edges.find((edge) => edge.id === 'e_plane_persist');
		expect(planePersist?.from).toEqual({ node: 'n_plane', port: 'mesh' });
		expect(planePersist?.to).toEqual({ node: 'n_persist', port: 'in' });

		const persistVertex = graph.edges.find((edge) => edge.id === 'e_persist_vertex');
		expect(persistVertex?.from).toEqual({ node: 'n_persist', port: 'out' });
		expect(persistVertex?.to).toEqual({ node: 'n_vertex', port: 'mesh' });

		const vertexFragment = graph.edges.find((edge) => edge.id === 'e_vertex_fragment');
		expect(vertexFragment?.from).toEqual({ node: 'n_vertex', port: 'varyings' });
		expect(vertexFragment?.to).toEqual({ node: 'n_fragment', port: 'varyings' });

		const effectFragment = graph.edges.find((edge) => edge.id === 'e_effect_fragment');
		expect(effectFragment?.from).toEqual({ node: 'n_effect', port: 'color' });
		expect(effectFragment?.to).toEqual({ node: 'n_fragment', port: 'color' });

		const fragmentDisplay = graph.edges.find((edge) => edge.id === 'e_fragment_display');
		expect(fragmentDisplay?.from).toEqual({ node: 'n_fragment', port: 'texture' });
		expect(fragmentDisplay?.to).toEqual({ node: 'n_display', port: 'color' });

		expect(graph.outputs[0]?.name).toBe('image');
		expect(graph.outputs[0]?.from).toEqual({ node: 'n_effect', port: 'color' });
		expect(graph.nodes.find((node) => node.id === 'n_plane')?.params).toEqual({
			resU: 2,
			resV: 2
		});
		expect(effectiveConsumers(graph)[0]?.stage).toBe('fragment');
		expect(graph.nodes.every((node) => node.position !== undefined)).toBe(true);
	});
});
