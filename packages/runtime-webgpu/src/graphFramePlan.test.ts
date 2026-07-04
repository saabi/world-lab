import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { getPrimitive, type GraphDocument, type Node, type Port, type PortRef, type PortSpec } from '@world-lab/graph';

import { buildPassOrder } from './frameGraph/order.js';
import { inferTextureUsage } from './frameGraph/realize.js';
import { buildIndependentPassGraph, planIndependentGraphFramePasses } from './graphFramePlan.js';

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? 'none'
	}));
}

function snapshotNode(id: string, primitiveId: string): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) throw new Error(`Unknown primitive: ${primitiveId}`);
	return {
		id,
		primitive: primitiveId,
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out')
	};
}

function portRef(nodeId: string, primitiveId: string, direction: 'in' | 'out', index: number): PortRef {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) throw new Error(`Unknown primitive: ${primitiveId}`);
	const ports = direction === 'in' ? primitive.inputs : primitive.outputs;
	const port = ports[index];
	if (!port) throw new Error(`Missing ${direction} port ${index} on ${primitiveId}`);
	return { node: nodeId, port: port.name };
}

function dualDisplayGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.plane'),
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
				from: portRef('n_plane', 'geometry.plane', 'out', 0),
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
				from: portRef('n_field_a', 'vector.vec4f', 'out', 0),
				to: portRef('n_fragment_a', 'stage.fragment', 'in', 1)
			},
			{
				id: 'e_field_b_fragment_b',
				from: portRef('n_field_b', 'vector.vec4f', 'out', 0),
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

describe('graphFramePlan', () => {
	it('plans one pass per independent pipeline display sink', () => {
		const passes = planIndependentGraphFramePasses(dualDisplayGraph());
		expect(passes.map((pass) => pass.targetId).sort()).toEqual(['pipeline_image_n_display_a', 'pipeline_image_n_display_b']);
		expect(passes[0]?.fieldOutput.node).toMatch(/^n_field_/);
	});

	it('builds a pass graph with no same-frame read edges between independent targets', () => {
		const passes = planIndependentGraphFramePasses(dualDisplayGraph());
		const graph = buildIndependentPassGraph(passes);
		const order = buildPassOrder(graph);
		expect(order.order.sort()).toEqual(['pipeline_image_n_display_a', 'pipeline_image_n_display_b']);
		expect(order.feedbackTargets).toEqual([]);
		expect(graph.targets[0]).toMatchObject({
			shape: { kind: 'texture', format: 'rgba8unorm' },
			lifetime: { kind: 'transient' },
			size: { kind: 'screen-relative', scale: 1 }
		});
		expect(graph.readbackTargets).toEqual([
			'pipeline_image_n_display_a',
			'pipeline_image_n_display_b'
		]);
		for (const target of graph.targets) {
			expect(inferTextureUsage(graph, target.id) & GPUTextureUsage.COPY_SRC).not.toBe(0);
		}
	});
});
