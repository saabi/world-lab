import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { deriveMeshTargets, validateGraph, validateGraphFull } from '@world-lab/graph';
import { evaluateMeshGenCpu } from '@world-lab/runtime-webgpu';

import { defaultPreviewGraph } from './graphBuilders.js';
import { inferPreviewBackend, resolvePreviewRenderer } from './previewBackend.js';
import { enumeratePreviewBuffers, inferDefaultPreviewBuffer, resolveMeshPreviewRequest } from './previewBuffers.js';
import { getGraphSample, GRAPH_SAMPLES, listSampleArtifacts } from './samples.js';

describe('graph-editor samples registry', () => {
	it('contains the Worley, cosine-palette, and displaced-sphere samples', () => {
		expect(GRAPH_SAMPLES.length).toBe(3);
		expect(getGraphSample('pipeline-worley-time')?.label).toContain('Worley');
		expect(getGraphSample('shadertoy-cosine-palette')?.label).toContain('Cosine palette');
		expect(getGraphSample('mesh-displaced-sphere')?.label).toContain('Displaced');
		expect(getGraphSample('default-scalar')).toBeUndefined();
	});

	it('builds a valid fragment-image graph for the ShaderToy sample', () => {
		const sample = getGraphSample('shadertoy-cosine-palette');
		expect(sample).toBeDefined();
		const graph = sample!.build();
		expect(validateGraph(graph).ok).toBe(true);
		expect(graph.nodes.map((node) => node.primitive)).toEqual(
			expect.arrayContaining([
				'geometry.plane',
				'buffer.persist',
				'stage.vertex',
				'stage.fragment',
				'target.display',
				'effect.cosinePalette'
			])
		);
		expect(graph.edges.find((edge) => edge.id === 'e_plane_persist')?.from).toEqual({
			node: 'n_plane',
			port: 'mesh'
		});
		expect(graph.edges.find((edge) => edge.id === 'e_persist_vertex')?.to).toEqual({
			node: 'n_vertex',
			port: 'mesh'
		});
		expect(graph.edges.find((edge) => edge.id === 'e_effect_fragment')?.from).toEqual({
			node: 'n_effect',
			port: 'color'
		});
		expect(graph.nodes.find((node) => node.id === 'n_plane')?.params).toEqual({
			resU: 2,
			resV: 2
		});
		expect(graph.consumers[0]?.stage).toBe('fragment');
		expect(graph.outputs[0]?.name).toBe('image');
	});

	it('builds a valid pipeline graph for the Worley sample', () => {
		const graph = getGraphSample('pipeline-worley-time')!.build();
		expect(validateGraph(graph).ok).toBe(true);
		expect(graph.nodes.some((node) => node.primitive === 'noise.worley2d')).toBe(true);
		expect(graph.edges.some((edge) => edge.id === 'e_worley_v4_2x')).toBe(true);
	});

	it('builds a displaced-sphere mesh sample wired to target.mesh', () => {
		const graph = getGraphSample('mesh-displaced-sphere')!.build();
		expect(validateGraph(graph).ok).toBe(true);
		expect(graph.nodes.map((node) => node.primitive)).toEqual(
			expect.arrayContaining([
				'surface.cubeFace',
				'transform.spherify',
				'noise.perlin3d',
				'transform.normalDisplace',
				'target.mesh'
			])
		);

		const meshTargets = deriveMeshTargets(graph);
		expect(meshTargets).toHaveLength(1);
		expect(meshTargets[0]).toMatchObject({
			meshNodeId: 'n_mesh',
			gridSize: 24,
			faceCount: 6,
			position: { node: 'n_disp', port: 'position' },
			normal: { node: 'n_sph', port: 'position' }
		});

		const meshBuffer = enumeratePreviewBuffers(graph).find((buffer) => buffer.dataType === 'mesh');
		expect(meshBuffer).toBeDefined();
		const request = resolveMeshPreviewRequest(graph, meshBuffer!);
		expect(request).toEqual(meshTargets[0]);

		const smooth = evaluateMeshGenCpu({
			graph,
			position: { node: 'n_sph', port: 'position' },
			normal: request!.normal,
			gridSize: request!.gridSize,
			faceCount: request!.faceCount
		});
		const displaced = evaluateMeshGenCpu({
			graph,
			position: request!.position,
			normal: request!.normal,
			gridSize: request!.gridSize,
			faceCount: request!.faceCount
		});

		let maxDelta = 0;
		for (let i = 0; i < smooth.positions.length; i++) {
			maxDelta = Math.max(maxDelta, Math.abs(smooth.positions[i]! - displaced.positions[i]!));
		}
		expect(maxDelta).toBeGreaterThan(0.01);
	});

	it('exposes every sample as a read-only GraphArtifact that validates', () => {
		for (const artifact of listSampleArtifacts()) {
			expect(artifact.meta?.sample).toBe(true);
			expect(validateGraphFull(artifact.graph).ok).toBe(true);
		}
	});
});

describe('inferPreviewBackend', () => {
	it('picks effect for a fragment vec4 image consumer', () => {
		const graph = getGraphSample('shadertoy-cosine-palette')!.build();
		expect(inferPreviewBackend(graph)).toBe('effect');
	});

	it('picks CPU scalar for the internal noise→remap graph', () => {
		expect(inferPreviewBackend(defaultPreviewGraph())).toBe('cpu');
	});

	it('defaults to the mesh preview buffer for the displaced-sphere sample', () => {
		const graph = getGraphSample('mesh-displaced-sphere')!.build();
		const buffer = inferDefaultPreviewBuffer(graph);
		expect(buffer?.dataType).toBe('mesh');
		expect(resolvePreviewRenderer(buffer)).toBe('mesh');
		expect(enumeratePreviewBuffers(graph)).toHaveLength(1);
	});
});
