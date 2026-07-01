import '@virtual-planet/graph';
import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '@virtual-planet/graph';

import { cosinePaletteEffectGraph, defaultPreviewGraph } from './graphBuilders.js';
import {
	allPreviewFamilyDataTypes,
	enumeratePreviewBuffers,
	inferDefaultPreviewBuffer,
	previewFamily,
	resolvePreviewBufferPort
} from './previewBuffers.js';

describe('previewFamily', () => {
	it('maps every DataType to the family table', () => {
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
			'list<f32>': 'data',
			'list<vec2f>': 'data',
			'list<vec3f>': 'data',
			'list<vec4f>': 'data',
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
