import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { getPrimitive, type GraphDocument, type Node, type Port, type PortRef, type PortSpec } from '@world-lab/graph';

import {
	geometryCacheFingerprint,
	PipelineGraphExecutor,
	planPipelineGraph
} from './pipelineGraph.js';

function dualTargetPipelineGraph(): GraphDocument {
	const fieldA = portRef('n_field_a', 'vector.vec4f', 'out', 0);
	const fieldB = portRef('n_field_b', 'vector.vec4f', 'out', 0);
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.fullscreenPlane'),
			snapshotNode('n_persist', 'buffer.persist'),
			snapshotNode('n_vertex', 'stage.vertex'),
			snapshotNode('n_fragment_a', 'stage.fragment'),
			snapshotNode('n_fragment_b', 'stage.fragment'),
			snapshotNode('n_display_a', 'target.display'),
			snapshotNode('n_display_b', 'target.display'),
			snapshotNode('n_field_a', 'vector.vec4f'),
			snapshotNode('n_field_b', 'vector.vec4f')
		],
		edges: [
			{
				id: 'e_plane_persist',
				from: portRef('n_plane', 'geometry.fullscreenPlane', 'out', 0),
				to: portRef('n_persist', 'buffer.persist', 'in', 0)
			},
			{
				id: 'e_persist_vertex',
				from: portRef('n_persist', 'buffer.persist', 'out', 0),
				to: portRef('n_vertex', 'stage.vertex', 'in', 0)
			},
			{
				id: 'e_vertex_fragment_a',
				from: portRef('n_vertex', 'stage.vertex', 'out', 0),
				to: portRef('n_fragment_a', 'stage.fragment', 'in', 0)
			},
			{
				id: 'e_vertex_fragment_b',
				from: portRef('n_vertex', 'stage.vertex', 'out', 0),
				to: portRef('n_fragment_b', 'stage.fragment', 'in', 0)
			},
			{
				id: 'e_field_a_fragment_a',
				from: fieldA,
				to: portRef('n_fragment_a', 'stage.fragment', 'in', 1)
			},
			{
				id: 'e_field_b_fragment_b',
				from: fieldB,
				to: portRef('n_fragment_b', 'stage.fragment', 'in', 1)
			},
			{
				id: 'e_fragment_a_display_a',
				from: portRef('n_fragment_a', 'stage.fragment', 'out', 0),
				to: portRef('n_display_a', 'target.display', 'in', 0)
			},
			{
				id: 'e_fragment_b_display_b',
				from: portRef('n_fragment_b', 'stage.fragment', 'out', 0),
				to: portRef('n_display_b', 'target.display', 'in', 0)
			}
		],
		outputs: [],
	};
}

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? 'none'
	}));
}

function snapshotNode(id: string, primitiveId: string, params?: Record<string, unknown>): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	return {
		id,
		primitive: primitiveId,
		params,
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out')
	};
}

function portRef(nodeId: string, primitiveId: string, direction: 'in' | 'out', index: number): PortRef {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	const ports = direction === 'in' ? primitive.inputs : primitive.outputs;
	const port = ports[index];
	if (!port) {
		throw new Error(`Missing ${direction} port ${index} on ${primitiveId}`);
	}
	return { node: nodeId, port: port.name };
}

function pipelineGraph(params?: Record<string, unknown>): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.fullscreenPlane', params),
			snapshotNode('n_persist', 'buffer.persist'),
			snapshotNode('n_vertex', 'stage.vertex'),
			snapshotNode('n_fragment', 'stage.fragment'),
			snapshotNode('n_display', 'target.display'),
			snapshotNode('n_frag', 'host.fragCoord'),
			snapshotNode('n_res', 'host.iResolution'),
			snapshotNode('n_time', 'host.iTime'),
			snapshotNode('n_effect', 'effect.cosinePalette')
		],
		edges: [
			{
				id: 'e_plane_persist',
				from: portRef('n_plane', 'geometry.fullscreenPlane', 'out', 0),
				to: portRef('n_persist', 'buffer.persist', 'in', 0)
			},
			{
				id: 'e_persist_vertex',
				from: portRef('n_persist', 'buffer.persist', 'out', 0),
				to: portRef('n_vertex', 'stage.vertex', 'in', 0)
			},
			{
				id: 'e_vertex_fragment',
				from: portRef('n_vertex', 'stage.vertex', 'out', 0),
				to: portRef('n_fragment', 'stage.fragment', 'in', 0)
			},
			{
				id: 'e_frag_effect',
				from: portRef('n_frag', 'host.fragCoord', 'out', 0),
				to: portRef('n_effect', 'effect.cosinePalette', 'in', 0)
			},
			{
				id: 'e_res_effect',
				from: portRef('n_res', 'host.iResolution', 'out', 0),
				to: portRef('n_effect', 'effect.cosinePalette', 'in', 1)
			},
			{
				id: 'e_time_effect',
				from: portRef('n_time', 'host.iTime', 'out', 0),
				to: portRef('n_effect', 'effect.cosinePalette', 'in', 2)
			},
			{
				id: 'e_effect_fragment',
				from: portRef('n_effect', 'effect.cosinePalette', 'out', 0),
				to: portRef('n_fragment', 'stage.fragment', 'in', 1)
			},
			{
				id: 'e_fragment_display',
				from: portRef('n_fragment', 'stage.fragment', 'out', 0),
				to: portRef('n_display', 'target.display', 'in', 0)
			}
		],
		outputs: [{ name: 'image', from: portRef('n_effect', 'effect.cosinePalette', 'out', 0) }],
	};
}

describe('@world-lab/runtime-webgpu pipeline graph', () => {
	it('plans the S0 pipeline via the generic geometry source role', () => {
		expect(planPipelineGraph(pipelineGraph())).toEqual({
			geometryNode: 'n_plane',
			geometryPrimitive: 'geometry.fullscreenPlane',
			persistNode: 'n_persist',
			vertexStageNode: 'n_vertex',
			fragmentStageNode: 'n_fragment',
			displayTargetNode: 'n_display',
			fieldOutput: { node: 'n_effect', port: 'color' }
		});
	});

	it('plans the first display target by default on a multi-target graph', () => {
		const graph = dualTargetPipelineGraph();
		expect(planPipelineGraph(graph)).toMatchObject({
			displayTargetNode: 'n_display_a',
			fragmentStageNode: 'n_fragment_a',
			fieldOutput: { node: 'n_field_a', port: 'value' }
		});
	});

	it('plans the requested output field on a multi-target graph', () => {
		const graph = dualTargetPipelineGraph();
		const fieldB = { node: 'n_field_b', port: 'value' };
		expect(planPipelineGraph(graph, { output: fieldB })).toMatchObject({
			displayTargetNode: 'n_display_b',
			fragmentStageNode: 'n_fragment_b',
			fieldOutput: fieldB
		});
	});

	it('plans the requested display sink on a multi-target graph', () => {
		const graph = dualTargetPipelineGraph();
		expect(planPipelineGraph(graph, { displayNodeId: 'n_display_b' })).toMatchObject({
			displayTargetNode: 'n_display_b',
			fragmentStageNode: 'n_fragment_b',
			fieldOutput: { node: 'n_field_b', port: 'value' }
		});
	});

	it('realizes buffer.persist geometry only once across frames with the same fingerprint', () => {
		const executor = new PipelineGraphExecutor();
		const graph = pipelineGraph();
		const first = planPipelineGraph(graph);
		executor.cache.realizeGeometry(geometryCacheFingerprint(graph, first));
		const second = planPipelineGraph(graph);
		executor.cache.realizeGeometry(geometryCacheFingerprint(graph, second));
		expect(executor.cache.geometryRealizations).toBe(1);
	});

	it('re-realizes geometry when the upstream source fingerprint changes', () => {
		const executor = new PipelineGraphExecutor();
		const base = pipelineGraph();
		const changed = pipelineGraph({ resU: 4, resV: 2 });
		const basePlan = planPipelineGraph(base);
		const changedPlan = planPipelineGraph(changed);
		executor.cache.realizeGeometry(geometryCacheFingerprint(base, basePlan));
		executor.cache.realizeGeometry(geometryCacheFingerprint(changed, changedPlan));
		expect(executor.cache.geometryRealizations).toBe(2);
		expect(geometryCacheFingerprint(base, basePlan)).not.toBe(
			geometryCacheFingerprint(changed, changedPlan)
		);
	});
});
