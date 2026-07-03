import { describe, expect, it } from 'vitest';
import type { DataType, GraphDocument, SpaceId } from './types.js';
import { getPrimitive } from './registry.js';
import { validateGraph } from './validate.js';
import { deserializeGraph, serializeGraph } from './serialize.js';
import './primitives/index.js';

function twoNodeGraph(opts?: {
	toType?: DataType;
	fromSpace?: SpaceId;
	toSpace?: SpaceId;
}): GraphDocument {
	return {
		version: '1',
		nodes: [
			{
				id: 'n_noise',
				primitive: 'noise.perlin3d',
				inputs: [{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f', space: 'body_dir' }],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32', space: opts?.fromSpace ?? 'none' }],
			},
			{
				id: 'n_remap',
				primitive: 'math.remap',
				inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: opts?.toType ?? 'f32', space: opts?.toSpace ?? 'none' }],
				outputs: [{ id: 'out', name: 'out', direction: 'out', dataType: 'f32' }],
			},
		],
		edges: [{ id: 'e1', from: { node: 'n_noise', port: 'value' }, to: { node: 'n_remap', port: 'x' } }],
		outputs: [{ name: 'height', from: { node: 'n_remap', port: 'out' } }],
		consumers: [{ type: 'terrain-mesh', outputs: ['height'] }],
	};
}

function resourceGraph(toType: DataType): GraphDocument {
	return {
		version: '1',
		nodes: [
			{
				id: 'n_image',
				primitive: 'resource.image',
				inputs: [],
				outputs: [{ id: 'resource', name: 'resource', direction: 'out', dataType: 'image' }],
			},
			{
				id: 'n_sample',
				primitive: 'image.sample',
				inputs: [{ id: 'resource', name: 'resource', direction: 'in', dataType: toType }],
				outputs: [{ id: 'color', name: 'color', direction: 'out', dataType: 'vec4f' }],
			},
		],
		edges: [{ id: 'e_resource', from: { node: 'n_image', port: 'resource' }, to: { node: 'n_sample', port: 'resource' } }],
		outputs: [{ name: 'color', from: { node: 'n_sample', port: 'color' } }],
		consumers: [{ type: 'preview', outputs: ['color'] }],
		resources: [
			{ id: 'heightmap', type: 'image' },
			{ id: 'surface', type: 'mesh' },
			{ id: 'music', type: 'audio' },
		],
	};
}

function pipelineEdge(fromType: DataType, toType: DataType): GraphDocument {
	return {
		version: '1',
		nodes: [
			{ id: 'a', primitive: 'geometry.plane', inputs: [], outputs: [{ id: 'mesh', name: 'mesh', direction: 'out', dataType: fromType }] },
			{ id: 'b', primitive: 'stage.vertex', inputs: [{ id: 'mesh', name: 'mesh', direction: 'in', dataType: toType }], outputs: [{ id: 'varyings', name: 'varyings', direction: 'out', dataType: 'varyings' }] },
		],
		edges: [{ id: 'e', from: { node: 'a', port: 'mesh' }, to: { node: 'b', port: 'mesh' } }],
		outputs: [{ name: 'varyings', from: { node: 'b', port: 'varyings' } }],
		consumers: [],
	};
}

describe('@world-lab/graph IR', () => {
	it('round-trips through serialize/deserialize', () => {
		const doc = twoNodeGraph();
		expect(deserializeGraph(serializeGraph(doc))).toEqual(doc);
	});

	it('round-trips a node display name through serialize/deserialize', () => {
		const doc = twoNodeGraph();
		doc.nodes[0] = { ...doc.nodes[0]!, name: 'Height noise' };
		expect(deserializeGraph(serializeGraph(doc))).toEqual(doc);
	});

	it('serialization is deterministic', () => {
		expect(serializeGraph(twoNodeGraph())).toBe(serializeGraph(twoNodeGraph()));
	});

	it('canonicalizes semantic tags during serialization and deserialization', () => {
		const doc = twoNodeGraph();
		doc.nodes[0]!.outputs[0]!.semantics = [
			'unit:m',
			'color:linear-srgb',
			'unit:m'
		];

		const serialized = serializeGraph(doc);
		const encoded = JSON.parse(serialized) as GraphDocument;
		expect(encoded.nodes[0]?.outputs[0]?.semantics).toEqual([
			'color:linear-srgb',
			'unit:m'
		]);
		expect(deserializeGraph(serialized).nodes[0]?.outputs[0]?.semantics).toEqual([
			'color:linear-srgb',
			'unit:m'
		]);
		expect(deserializeGraph(JSON.stringify(doc)).nodes[0]?.outputs[0]?.semantics).toEqual([
			'color:linear-srgb',
			'unit:m'
		]);
	});

	it('accepts a type- and space-matching edge', () => {
		expect(validateGraph(twoNodeGraph()).ok).toBe(true);
	});

	it('accepts matching open space identifiers without core registration', () => {
		expect(
			validateGraph(twoNodeGraph({ fromSpace: 'stereo_field', toSpace: 'stereo_field' })).ok
		).toBe(true);
		expect(
			validateGraph(twoNodeGraph({ fromSpace: 'stereo_field', toSpace: 'speaker_field' })).ok
		).toBe(false);
	});

	it('rejects a type-mismatched edge', () => {
		const res = validateGraph(twoNodeGraph({ toType: 'vec3f' }));
		expect(res.ok).toBe(false);
		expect(res.issues.some((i) => i.kind === 'type-mismatch')).toBe(true);
	});

	it('accepts vec2f to vec3f promotion on an edge', () => {
		const doc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_uv',
					primitive: 'procedural.uv',
					inputs: [],
					outputs: [{ id: 'uv', name: 'uv', direction: 'out', dataType: 'vec2f', space: 'none' }]
				},
				{
					id: 'n_perlin',
					primitive: 'noise.perlin3d',
					inputs: [
						{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f', space: 'none' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32', space: 'none' }]
				}
			],
			edges: [
				{ id: 'e_uv_perlin', from: { node: 'n_uv', port: 'uv' }, to: { node: 'n_perlin', port: 'position' } }
			],
			outputs: [],
			consumers: []
		};
		expect(validateGraph(doc).ok).toBe(true);
	});

	it('rejects a coordinate-space-mismatched edge', () => {
		const res = validateGraph(twoNodeGraph({ fromSpace: 'world_dir', toSpace: 'body_dir' }));
		expect(res.ok).toBe(false);
		expect(res.issues.some((i) => i.kind === 'space-mismatch')).toBe(true);
	});

	it('accepts matching resource ports', () => {
		expect(validateGraph(resourceGraph('image')).ok).toBe(true);
	});

	it('handles pipeline resource ports (geometry/buffers/targets) by kind', () => {
		// geometry → geometry edge is valid
		const ok = validateGraph(pipelineEdge('geometry', 'geometry'));
		expect(ok.ok).toBe(true);
		// geometry → f32 (resource into value) rejected
		expect(validateGraph(pipelineEdge('geometry', 'f32')).ok).toBe(false);
		// renderTarget → geometry (cross-kind) rejected
		expect(validateGraph(pipelineEdge('renderTarget', 'geometry')).ok).toBe(false);
		// texture → geometry (cross-kind) rejected
		expect(validateGraph(pipelineEdge('texture', 'geometry')).ok).toBe(false);
	});

	it('registers S0 pipeline node stubs with resource ports', () => {
		expect(getPrimitive('geometry.fullscreenPlane')).toMatchObject({
			category: 'geometry/source',
			outputs: [{ name: 'mesh', dataType: 'geometry' }]
		});
		expect(getPrimitive('geometry.fullscreenPlane')?.metadata?.help).toContain('geometry.plane');
		expect(getPrimitive('geometry.plane')).toMatchObject({
			category: 'geometry/source',
			outputs: [{ name: 'mesh', dataType: 'geometry' }]
		});
		expect(getPrimitive('geometry.plane')?.metadata?.help).toContain('geometry.fullscreenPlane');
		expect(getPrimitive('buffer.persist')).toMatchObject({
			category: 'buffer',
			inputs: [{ name: 'in', dataType: 'geometry' }],
			outputs: [{ name: 'out', dataType: 'geometry' }]
		});
		expect(getPrimitive('stage.vertex')).toMatchObject({
			category: 'stage',
			inputs: [{ name: 'mesh', dataType: 'geometry' }],
			outputs: [{ name: 'varyings', dataType: 'varyings' }]
		});
		expect(getPrimitive('stage.fragment')).toMatchObject({
			category: 'stage',
			inputs: [
				{ name: 'varyings', dataType: 'varyings' },
				{ name: 'color', dataType: 'vec4f' }
			],
			outputs: [{ name: 'texture', dataType: 'texture' }]
		});
		expect(getPrimitive('target.display')).toMatchObject({
			category: 'target/sink',
			inputs: [{ name: 'color', dataType: 'texture' }],
			outputs: []
		});
		expect(getPrimitive('target.mesh')).toMatchObject({
			category: 'target/sink',
			inputs: [
				{ name: 'position', dataType: 'vec3f' },
				{ name: 'normal', dataType: 'vec3f' }
			],
			outputs: [],
			metadata: { role: 'meshTarget' }
		});
	});

	it('accepts edges from output ports that share a name with an input on the source node', () => {
		const doc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_mul',
					primitive: 'vector.mulScalar.vec2f',
					inputs: [
						{ id: 'value', name: 'value', direction: 'in', dataType: 'vec2f' },
						{ id: 'scalar', name: 'scalar', direction: 'in', dataType: 'f32' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'vec2f' }]
				},
				{
					id: 'n_add',
					primitive: 'vector.add.vec2f',
					inputs: [
						{ id: 'a', name: 'a', direction: 'in', dataType: 'vec2f' },
						{ id: 'b', name: 'b', direction: 'in', dataType: 'vec2f' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'vec2f' }]
				}
			],
			edges: [{ id: 'e_mul_add', from: { node: 'n_mul', port: 'value' }, to: { node: 'n_add', port: 'a' } }],
			outputs: [],
			consumers: []
		};
		expect(validateGraph(doc).ok).toBe(true);
	});

	it('rejects mismatched resource ports', () => {
		const res = validateGraph(resourceGraph('mesh'));
		expect(res.ok).toBe(false);
		expect(res.issues).toContainEqual({
			kind: 'type-mismatch',
			edge: 'e_resource',
			from: 'image',
			to: 'mesh',
		});
	});

	it('round-trips resource dependencies through serialization', () => {
		const doc = resourceGraph('image');
		expect(deserializeGraph(serializeGraph(doc))).toEqual(doc);
	});
});
