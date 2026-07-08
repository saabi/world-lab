import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import {
	deriveMeshTargets,
	effectiveConsumers,
	getPrimitive,
	validateGraph,
	validateGraphFull
} from '@world-lab/graph';
import { evaluateMeshGenCpu } from '@world-lab/runtime-webgpu';

import { defaultPreviewGraph } from './graphBuilders.js';
import { inferPreviewBackend, resolvePreviewRenderer } from './previewBackend.js';
import { enumeratePreviewBuffers, inferDefaultPreviewBuffer, resolveMeshPreviewRequest } from './previewBuffers.js';
import { getGraphSample, GRAPH_SAMPLES, listSampleArtifacts } from './samples.js';

describe('graph-editor samples registry', () => {
	it('contains the pipeline, Foundation 2, and mesh samples', () => {
		expect(GRAPH_SAMPLES.length).toBe(10);
		expect(getGraphSample('pipeline-worley-time')?.label).toContain('Worley');
		expect(getGraphSample('shadertoy-cosine-palette')?.label).toContain('Cosine palette');
		expect(getGraphSample('mesh-displaced-sphere')?.label).toContain('Displaced');
		expect(getGraphSample('mesh-rigid-transforms')?.label).toContain('Rigid transforms');
		expect(getGraphSample('migration-default-preview')).toBeDefined();
		expect(getGraphSample('migration-fullscreen-fragment')).toBeDefined();
		expect(getGraphSample('foundation-cross-pass-texture')).toBeDefined();
		expect(getGraphSample('foundation-buffer-feedback')).toBeDefined();
		expect(getGraphSample('foundation-compute-buffer')).toBeDefined();
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
		expect(effectiveConsumers(graph)[0]?.stage).toBe('fragment');
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

	it('builds a rotated-plane mesh sample with transform.rotate', () => {
		const graph = getGraphSample('mesh-rotated-plane')!.build();
		expect(validateGraph(graph).ok).toBe(true);
		const rot = graph.nodes.find((node) => node.id === 'n_rot');
		expect(rot?.params).toMatchObject({ rotationX: 0.65 });
		expect(deriveMeshTargets(graph)).toHaveLength(1);
	});

	it('builds a rigid-transforms mesh sample chaining scale, rotate, and translate', () => {
		const graph = getGraphSample('mesh-rigid-transforms')!.build();
		expect(validateGraphFull(graph).ok).toBe(true);
		expect(graph.nodes.map((node) => node.primitive)).toEqual(
			expect.arrayContaining([
				'transform.scale',
				'transform.rotate',
				'transform.translate',
				'target.mesh'
			])
		);
		const request = resolveMeshPreviewRequest(
			graph,
			enumeratePreviewBuffers(graph).find((buffer) => buffer.dataType === 'mesh')!
		);
		expect(request?.position).toEqual({ node: 'n_translate', port: 'position' });
		const mesh = evaluateMeshGenCpu({
			graph,
			position: request!.position,
			normal: request!.normal,
			gridSize: request!.gridSize,
			faceCount: request!.faceCount
		});
		expect(mesh.vertexCount).toBeGreaterThan(0);
	});

	it('derives sink invocations identical to mesh descriptors for every mesh sample', () => {
		const implementation = getPrimitive('target.mesh')!.implementation;
		expect(implementation.kind).toBe('sink');
		if (implementation.kind !== 'sink') return;

		for (const sample of GRAPH_SAMPLES) {
			const graph = sample.build();
			const meshNode = graph.nodes.find((node) => node.primitive === 'target.mesh');
			if (!meshNode) continue;
			const descriptors = deriveMeshTargets(graph);
			expect(descriptors, sample.id).toHaveLength(1);
			const invocation = implementation.sink.deriveInvocation(graph, meshNode);
			expect(invocation?.payload, sample.id).toEqual(descriptors[0]);
			expect(invocation?.dependencies, sample.id).toEqual([
				descriptors[0]!.position,
				descriptors[0]!.normal
			]);
		}
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
