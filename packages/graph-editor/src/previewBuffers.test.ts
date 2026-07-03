import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { getPrimitive, type GraphDocument, type Node, type PortRef } from '@world-lab/graph';

import { cosinePaletteEffectGraph, defaultPreviewGraph } from './graphBuilders.js';
import {
	allPreviewFamilyDataTypes,
	enumeratePreviewBuffers,
	inferDefaultPreviewBuffer,
	previewFamily,
	resolveMeshPreviewRequest,
	resolvePreviewBufferPort
} from './previewBuffers.js';

function snapshotNode(id: string, primitiveId: string, params?: Record<string, unknown>): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	return {
		id,
		primitive: primitiveId,
		params,
		inputs: primitive.inputs.map((spec) => ({
			id: spec.name,
			name: spec.name,
			direction: 'in' as const,
			dataType: spec.dataType,
			space: spec.space ?? 'none'
		})),
		outputs: primitive.outputs.map((spec) => ({
			id: spec.name,
			name: spec.name,
			direction: 'out' as const,
			dataType: spec.dataType,
			space: spec.space ?? 'none'
		}))
	};
}

function portRef(nodeId: string, port: string): PortRef {
	return { node: nodeId, port };
}

function meshTargetGraph(): GraphDocument {
	return {
		version: '1',
		nodes: [
			snapshotNode('n_uv', 'procedural.uv'),
			snapshotNode('n_plane', 'surface.plane'),
			snapshotNode('n_mesh', 'target.mesh', { gridSize: 20, faceCount: 1 })
		],
		edges: [
			{
				id: 'e_uv_plane',
				from: portRef('n_uv', 'uv'),
				to: portRef('n_plane', 'uv')
			},
			{
				id: 'e_pos',
				from: portRef('n_plane', 'position'),
				to: portRef('n_mesh', 'position')
			},
			{
				id: 'e_norm',
				from: portRef('n_plane', 'normal'),
				to: portRef('n_mesh', 'normal')
			}
		],
		outputs: [],
		consumers: []
	};
}

describe('previewFamily', () => {	it('maps every DataType to the family table', () => {
		const expected: Record<string, string> = {
			image: 'image',
			texture: 'image',
			renderTarget: 'image',
			geometry: 'geometry',
			mesh: 'geometry',
			vertexBuffer: 'geometry',
			indexBuffer: 'geometry',
			varyings: 'geometry',
			audio: 'audio',
			f32: 'data',
			vec2f: 'data',
			vec3f: 'data',
			vec4f: 'data',
			bool: 'data',
			'tuple<f32>': 'data',
			'tuple<vec2f>': 'data',
			'tuple<vec3f>': 'data',
			'tuple<vec4f>': 'data',
			storageBuffer: 'data',
			bindGroup: 'data'
		};

		for (const dataType of allPreviewFamilyDataTypes()) {
			expect(previewFamily(dataType)).toBe(expected[dataType]);
		}
	});
});

describe('enumeratePreviewBuffers', () => {
	it('lists the scalar field output as data', () => {
		const buffers = enumeratePreviewBuffers(defaultPreviewGraph());
		expect(buffers).toHaveLength(1);
		expect(buffers[0]).toMatchObject({
			id: 'field',
			label: 'field',
			family: 'data',
			dataType: 'f32',
			inferred: true
		});
	});

	it('lists the pipeline display target as image', () => {
		const graph: GraphDocument = {
			...cosinePaletteEffectGraph(),
			outputs: [],
			consumers: []
		};
		const buffers = enumeratePreviewBuffers(graph);
		expect(buffers.some((buffer) => buffer.family === 'image')).toBe(true);
		expect(inferDefaultPreviewBuffer(graph)?.family).toBe('image');
		const imageBuffer = buffers.find((buffer) => buffer.family === 'image')!;
		expect(resolvePreviewBufferPort(graph, imageBuffer)).toEqual({
			node: 'n_effect',
			port: 'color'
		});
	});

	it('marks vec4f value outputs as ambiguous (inferred: false)', () => {
		const graph: GraphDocument = {
			...defaultPreviewGraph(),
			outputs: [{ name: 'rgba', from: { node: 'n_remap', port: 'value' } }],
			nodes: defaultPreviewGraph().nodes.map((node) =>
				node.id === 'n_remap'
					? {
							...node,
							outputs: node.outputs.map((port) =>
								port.name === 'value' ? { ...port, dataType: 'vec4f' as const } : port
							)
						}
					: node
			)
		};
		const buffer = enumeratePreviewBuffers(graph)[0]!;
		expect(buffer.dataType).toBe('vec4f');
		expect(buffer.family).toBe('data');
		expect(buffer.inferred).toBe(false);
	});

	it('lists a geometry output as geometry', () => {
		const graph: GraphDocument = {
			...cosinePaletteEffectGraph(),
			outputs: [{ name: 'plane', from: { node: 'n_plane', port: 'mesh' } }],
			consumers: []
		};
		const buffer = enumeratePreviewBuffers(graph).find((candidate) => candidate.id === 'plane');
		expect(buffer).toMatchObject({
			family: 'geometry',
			dataType: 'geometry',
			inferred: true
		});
	});

	it('dedupes declared outputs and pipeline field sources', () => {
		const graph = cosinePaletteEffectGraph();
		const buffers = enumeratePreviewBuffers(graph);
		const imageBuffers = buffers.filter((buffer) => buffer.family === 'image');
		expect(imageBuffers).toHaveLength(1);
		expect(imageBuffers[0]?.id).toBe('image');
	});

	it('prefers the display sink node name over the synthetic output name for a declared pipeline output', () => {
		const base = cosinePaletteEffectGraph();
		const fieldOutput = base.outputs[0]!.from;
		const graph: GraphDocument = {
			...base,
			outputs: [{ name: 'pipeline_image', from: fieldOutput }],
			nodes: base.nodes.map((node) => (node.id === 'n_display' ? { ...node, name: 'Final look' } : node))
		};
		const buffer = enumeratePreviewBuffers(graph).find((candidate) => candidate.family === 'image');
		// id (the persistence key) stays on the synthetic output name; only the label changes.
		expect(buffer?.id).toBe('pipeline_image');
		expect(buffer?.label).toBe('Final look');
	});

	it('falls back to the synthetic output name when the display sink has no name set', () => {
		const base = cosinePaletteEffectGraph();
		const fieldOutput = base.outputs[0]!.from;
		const graph: GraphDocument = {
			...base,
			outputs: [{ name: 'pipeline_image', from: fieldOutput }]
		};
		const buffer = enumeratePreviewBuffers(graph).find((candidate) => candidate.family === 'image');
		expect(buffer?.label).toBe('pipeline_image');
	});

	it('prefers the display sink node name over its primitive id for an undeclared pipeline sink', () => {
		const base = cosinePaletteEffectGraph();
		const graph: GraphDocument = {
			...base,
			outputs: [],
			consumers: [],
			nodes: base.nodes.map((node) => (node.id === 'n_display' ? { ...node, name: 'Final look' } : node))
		};
		const buffer = enumeratePreviewBuffers(graph).find((candidate) => candidate.family === 'image');
		// Field-output suffix (`· node.port`) is unrelated, existing behavior for undeclared
		// sinks — this test only cares that the base label prefers the node name.
		expect(buffer?.label).toBe('Final look · n_effect.color');
	});

	it('lists one buffer per pipeline display target with distinct ids', () => {
		const graph: GraphDocument = {
			...cosinePaletteEffectGraph(),
			outputs: [],
			consumers: [],
			nodes: [
				...cosinePaletteEffectGraph().nodes,
				{
					id: 'n_display_b',
					primitive: 'target.display',
					inputs: [{ id: 'color', name: 'color', direction: 'in', dataType: 'texture' }],
					outputs: []
				}
			],
			edges: [
				...cosinePaletteEffectGraph().edges,
				{
					id: 'e_fragment_display_b',
					from: { node: 'n_fragment', port: 'texture' },
					to: { node: 'n_display_b', port: 'color' }
				}
			]
		};

		const buffers = enumeratePreviewBuffers(graph);
		const imageBuffers = buffers.filter((buffer) => buffer.family === 'image');
		expect(imageBuffers).toHaveLength(2);
		expect(new Set(imageBuffers.map((buffer) => buffer.id)).size).toBe(2);
		expect(imageBuffers.map((buffer) => buffer.id).sort()).toEqual(['n_display', 'n_display_b']);
		expect(resolvePreviewBufferPort(graph, imageBuffers[0]!)).toEqual({
			node: 'n_effect',
			port: 'color'
		});
		expect(resolvePreviewBufferPort(graph, imageBuffers[1]!)).toEqual({
			node: 'n_effect',
			port: 'color'
		});
	});
});

describe('mesh preview buffers', () => {
	it('enumerates a geometry buffer for a wired target.mesh sink', () => {
		const graph = meshTargetGraph();
		const buffer = enumeratePreviewBuffers(graph).find((candidate) => candidate.id === 'n_mesh');
		expect(buffer).toMatchObject({
			family: 'geometry',
			dataType: 'mesh',
			inferred: true,
			source: { sinkNode: 'n_mesh' }
		});
	});

	it('resolves mesh preview request from a mesh buffer', () => {
		const graph = meshTargetGraph();
		const buffer = enumeratePreviewBuffers(graph).find((candidate) => candidate.id === 'n_mesh')!;
		expect(resolveMeshPreviewRequest(graph, buffer)).toEqual({
			meshNodeId: 'n_mesh',
			position: portRef('n_plane', 'position'),
			normal: portRef('n_plane', 'normal'),
			gridSize: 20,
			faceCount: 1
		});
	});

	it('returns null for geometry buffers that are not mesh sinks', () => {
		const graph: GraphDocument = {
			...cosinePaletteEffectGraph(),
			outputs: [{ name: 'plane', from: { node: 'n_plane', port: 'mesh' } }],
			consumers: []
		};
		const buffer = enumeratePreviewBuffers(graph).find((candidate) => candidate.id === 'plane')!;
		expect(resolveMeshPreviewRequest(graph, buffer)).toBeNull();
	});
});

describe('mesh preview buffers', () => {
	it('enumerates a geometry buffer for a wired target.mesh sink', () => {
		const graph = meshTargetGraph();
		const buffer = enumeratePreviewBuffers(graph).find((candidate) => candidate.id === 'n_mesh');
		expect(buffer).toMatchObject({
			family: 'geometry',
			dataType: 'mesh',
			inferred: true,
			source: { sinkNode: 'n_mesh' }
		});
	});

	it('resolves mesh preview request from a mesh buffer', () => {
		const graph = meshTargetGraph();
		const buffer = enumeratePreviewBuffers(graph).find((candidate) => candidate.id === 'n_mesh')!;
		expect(resolveMeshPreviewRequest(graph, buffer)).toEqual({
			meshNodeId: 'n_mesh',
			position: portRef('n_plane', 'position'),
			normal: portRef('n_plane', 'normal'),
			gridSize: 20,
			faceCount: 1
		});
	});

	it('returns null for geometry buffers that are not mesh sinks', () => {
		const graph: GraphDocument = {
			...cosinePaletteEffectGraph(),
			outputs: [{ name: 'plane', from: { node: 'n_plane', port: 'mesh' } }],
			consumers: []
		};
		const buffer = enumeratePreviewBuffers(graph).find((candidate) => candidate.id === 'plane')!;
		expect(resolveMeshPreviewRequest(graph, buffer)).toBeNull();
	});
});
