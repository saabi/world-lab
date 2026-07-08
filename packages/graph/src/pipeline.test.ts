import { describe, expect, it } from 'vitest';
import { Type } from '@world-lab/schema';

import { getPrimitive, registerPrimitive } from './registry.js';
import type { GraphDocument, Node, Port, PortRef } from './types.js';
import type { NodePrimitive, NodePrimitiveInput, PortSpec, PrimitiveMetadata } from './primitive.js';
import {
	derivePipelineConsumers,
	effectiveConsumers,
	effectiveGraphDocument,
	effectiveOutputs,
	isPipelineStage,
	isPipelineTarget,
	outputSinkNodeIds,
	pipelineFieldOutput,
	PIPELINE_IMAGE_OUTPUT_NAME,
	tryPipelinePresentation
} from './pipeline.js';
import { validateGraphFull } from './validate.js';

import './primitives/index.js';

const F361_FRAGMENT_ID = 'test.f361PipelineFragmentStage';

function testPrimitive(input: NodePrimitiveInput): NodePrimitive {
	const existing = getPrimitive(input.id);
	if (existing) return existing;
	registerPrimitive(input);
	return getPrimitive(input.id)!;
}

function testFragmentStagePrimitive(): NodePrimitive {
	return testPrimitive({
		id: F361_FRAGMENT_ID,
		category: 'test/stage',
		inputs: [
			{ name: 'varyings', dataType: 'varyings' },
			{ name: 'color', dataType: 'vec4f' }
		],
		outputs: [{ name: 'texture', dataType: 'texture' }],
		params: Type.Object({}),
		implementation: { kind: 'legacy-structural', marker: F361_FRAGMENT_ID },
		metadata: {
			description: 'F3.6.1 test-only fragment stage fixture.',
			role: 'pipelineStage',
			pipelineStageKind: 'fragment'
		}
	});
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

function s0PipelineGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_plane', 'geometry.fullscreenPlane'),
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
		outputs: [{ name: 'image', from: portRef('n_effect', 'effect.cosinePalette', 'out', 0) }]
	};
}

function graphWithFragmentStage(primitiveId: string): GraphDocument {
	testFragmentStagePrimitive();
	return {
		...s0PipelineGraph(),
		nodes: s0PipelineGraph().nodes.map((node) =>
			node.id === 'n_fragment' ? snapshotNode('n_fragment', primitiveId) : node
		)
	};
}

const validStageMetadata: PrimitiveMetadata = { pipelineStageKind: 'vertex' };
void validStageMetadata;
// @ts-expect-error pipelineStageKind accepts only vertex or fragment.
const invalidStageMetadata: PrimitiveMetadata = { pipelineStageKind: 'compute' };
void invalidStageMetadata;

describe('@world-lab/graph pipeline output reconciliation', () => {
	it('treats target.display as a pipeline render target', () => {
		const display = s0PipelineGraph().nodes.find((node) => node.primitive === 'target.display');
		expect(display).toBeDefined();
		expect(isPipelineTarget(display!)).toBe(true);
	});

	it('includes declared outputs and pipeline targets in outputSinkNodeIds', () => {
		expect(outputSinkNodeIds(s0PipelineGraph()).sort()).toEqual(['n_display', 'n_effect'].sort());
	});

	it('validates a wired pipeline with empty doc.outputs (no dangling-node spam)', () => {
		const graph: GraphDocument = {
			...s0PipelineGraph(),
			outputs: []
		};
		const result = validateGraphFull(graph);
		expect(result.ok).toBe(true);
		expect(result.issues.some((issue) => issue.kind === 'dangling-node')).toBe(false);
		expect(result.issues.some((issue) => issue.kind === 'no-output-path')).toBe(false);
	});

	it('still reports exactly one no-output-path for a stale declared output ref', () => {
		const graph: GraphDocument = {
			...s0PipelineGraph(),
			outputs: [{ name: 'image', from: { node: 'missing_effect', port: 'color' } }]
		};
		const result = validateGraphFull(graph);
		expect(result.ok).toBe(false);
		const stale = result.issues.filter((issue) => issue.kind === 'no-output-path');
		expect(stale).toHaveLength(1);
		expect(stale[0]).toMatchObject({
			kind: 'no-output-path',
			output: 'image',
			node: 'missing_effect',
			port: 'color'
		});
		expect(result.issues.some((issue) => issue.kind === 'dangling-node')).toBe(false);
	});
});

describe('@world-lab/graph pipeline stage discovery', () => {
	it('classifies built-in pipeline stages without changing their swap role', () => {
		const vertex = getPrimitive('stage.vertex')!;
		const fragment = getPrimitive('stage.fragment')!;

		expect(vertex.metadata?.pipelineStageKind).toBe('vertex');
		expect(fragment.metadata?.pipelineStageKind).toBe('fragment');
		expect(vertex.metadata?.role).toBe('pipelineStage');
		expect(fragment.metadata?.role).toBe('pipelineStage');
	});

	it('matches only the requested pipeline stage kind', () => {
		const graph = s0PipelineGraph();
		const vertex = graph.nodes.find((node) => node.id === 'n_vertex')!;
		const fragment = graph.nodes.find((node) => node.id === 'n_fragment')!;
		const persist = graph.nodes.find((node) => node.id === 'n_persist')!;
		const unregistered: Node = {
			...vertex,
			id: 'n_missing',
			primitive: 'test.f361MissingPrimitive'
		};

		expect(isPipelineStage(vertex, 'vertex')).toBe(true);
		expect(isPipelineStage(vertex, 'fragment')).toBe(false);
		expect(isPipelineStage(fragment, 'fragment')).toBe(true);
		expect(isPipelineStage(fragment, 'vertex')).toBe(false);
		expect(isPipelineStage(persist, 'vertex')).toBe(false);
		expect(isPipelineStage(unregistered, 'vertex')).toBe(false);
	});

	it('derives presentations through a nonstandard fragment-stage primitive id', () => {
		const graph = graphWithFragmentStage(F361_FRAGMENT_ID);
		const presentation = tryPipelinePresentation(graph);

		expect(presentation).toMatchObject({
			displayNodeId: 'n_display',
			fieldOutput: portRef('n_effect', 'effect.cosinePalette', 'out', 0)
		});
		expect(derivePipelineConsumers(graph)).toEqual([presentation!.consumer]);
		expect(effectiveOutputs({ ...graph, outputs: [] })).toEqual([
			{
				name: PIPELINE_IMAGE_OUTPUT_NAME,
				from: portRef('n_effect', 'effect.cosinePalette', 'out', 0)
			}
		]);
	});
});

describe('@world-lab/graph pipeline consumer derivation', () => {
	it('derives a fragment image consumer from a wired display target', () => {
		const graph: GraphDocument = {
			...s0PipelineGraph(),
			outputs: [],
		};
		const presentation = tryPipelinePresentation(graph);
		expect(presentation).toMatchObject({
			displayNodeId: 'n_display',
			outputName: PIPELINE_IMAGE_OUTPUT_NAME,
			fieldOutput: portRef('n_effect', 'effect.cosinePalette', 'out', 0)
		});
		expect(derivePipelineConsumers(graph)).toEqual([presentation!.consumer]);

		const displayNode = graph.nodes.find((node) => node.id === 'n_display')!;
		const implementation = getPrimitive('target.display')!.implementation;
		expect(implementation.kind).toBe('sink');
		if (implementation.kind !== 'sink') return;
		const invocation = implementation.sink.deriveInvocation(graph, displayNode);
		expect(invocation?.dependencies).toEqual([
			portRef('n_effect', 'effect.cosinePalette', 'out', 0)
		]);
		expect(invocation?.payload).toEqual(presentation);
	});

	it('reuses an existing declared output name for the same field port', () => {
		const graph = s0PipelineGraph();
		const presentation = tryPipelinePresentation(graph);
		expect(presentation?.outputName).toBe('image');
		expect(effectiveOutputs(graph)).toEqual(graph.outputs);
	});

	it('derives outputs and consumers from sink nodes', () => {
		const graph = s0PipelineGraph();
		expect(effectiveConsumers(graph)).toEqual(derivePipelineConsumers(graph));
		expect(effectiveGraphDocument(graph).outputs).toEqual(graph.outputs);
	});

	it('fills empty pipeline doc metadata for compile and preview', () => {
		const graph: GraphDocument = {
			...s0PipelineGraph(),
			outputs: [],
		};
		expect(pipelineFieldOutput(graph)).toEqual(
			portRef('n_effect', 'effect.cosinePalette', 'out', 0)
		);
		expect(effectiveOutputs(graph)).toEqual([
			{
				name: PIPELINE_IMAGE_OUTPUT_NAME,
				from: portRef('n_effect', 'effect.cosinePalette', 'out', 0)
			}
		]);
		expect(effectiveConsumers(graph)).toHaveLength(1);
		expect(effectiveConsumers(graph)[0]).toMatchObject({
			stage: 'fragment',
			type: 'image',
			outputs: [PIPELINE_IMAGE_OUTPUT_NAME]
		});
	});

	it('derives distinct outputs and consumers per display sink on multi-target graphs', () => {
		const graph: GraphDocument = {
			...s0PipelineGraph(),
			outputs: [],
			nodes: [
				...s0PipelineGraph().nodes,
				snapshotNode('n_fragment_b', 'stage.fragment'),
				snapshotNode('n_display_b', 'target.display'),
				snapshotNode('n_effect_b', 'effect.cosinePalette')
			],
			edges: [
				...s0PipelineGraph().edges,
				{
					id: 'e_vertex_fragment_b',
					from: portRef('n_vertex', 'stage.vertex', 'out', 0),
					to: portRef('n_fragment_b', 'stage.fragment', 'in', 0)
				},
				{
					id: 'e_effect_b_fragment_b',
					from: portRef('n_effect_b', 'effect.cosinePalette', 'out', 0),
					to: portRef('n_fragment_b', 'stage.fragment', 'in', 1)
				},
				{
					id: 'e_fragment_b_display_b',
					from: portRef('n_fragment_b', 'stage.fragment', 'out', 0),
					to: portRef('n_display_b', 'target.display', 'in', 0)
				}
			]
		};

		const effective = effectiveGraphDocument(graph);
		const imageConsumers = effectiveConsumers(effective).filter(
			(consumer) => consumer.type === 'image'
		);
		expect(imageConsumers).toHaveLength(2);
		expect(new Set(imageConsumers.map((consumer) => consumer.id)).size).toBe(2);
		expect(new Set(effective.outputs.map((output) => output.name)).size).toBe(2);
		expect(effective.outputs.map((output) => output.name).sort()).toEqual(
			['pipeline_image_n_display', 'pipeline_image_n_display_b'].sort()
		);
	});
});
