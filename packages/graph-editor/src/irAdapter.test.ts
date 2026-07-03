import '@world-lab/graph';
import { describe, expect, it, beforeEach } from 'vitest';
import type { GraphDocument } from '@world-lab/graph';
import {
	applyEditIntent,
	graphToFlow,
	nodeDisplayLabel,
	resetIdCounters,
	validateConnection
} from './irAdapter.js';
import { cosinePaletteEffectGraph } from './graphBuilders.js';
import { fullValidation } from './graphValidation.js';

function emptyDoc(): GraphDocument {
	return {
		version: '1',
		nodes: [],
		edges: [],
		outputs: [],
		consumers: []
	};
}

describe('@world-lab/graph-editor irAdapter', () => {
	beforeEach(() => {
		resetIdCounters();
	});

	it('adds and removes nodes through applyEditIntent', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 10, y: 20 }
		});
		expect(doc.nodes).toHaveLength(1);

		doc = applyEditIntent(doc, { kind: 'remove-node', nodeId: doc.nodes[0]!.id });
		expect(doc.nodes).toHaveLength(0);
	});

	it('round-trips node positions through graphToFlow', () => {
		const doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'procedural.uv',
			position: { x: 42, y: 7 }
		});
		const flow = graphToFlow(doc);
		expect(flow.nodes[0]?.position).toEqual({ x: 42, y: 7 });
	});

	it('rejects type-mismatched connections', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'procedural.uv',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 100, y: 0 }
		});

		const uvNode = doc.nodes.find((node) => node.primitive === 'procedural.uv')!;
		const remapNode = doc.nodes.find((node) => node.primitive === 'math.remap')!;

		const result = validateConnection(
			doc,
			{ node: uvNode.id, port: 'uv' },
			{ node: remapNode.id, port: 'x' }
		);
		expect(result.ok).toBe(false);
		expect(result.issues.some((issue) => issue.kind === 'type-mismatch')).toBe(true);
	});

	it('rejects space-mismatched connections', () => {
		const doc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_a',
					primitive: 'noise.perlin3d',
					inputs: [
						{
							id: 'position',
							name: 'position',
							direction: 'in',
							dataType: 'vec3f',
							space: 'body_dir'
						}
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32', space: 'world_dir' }]
				},
				{
					id: 'n_b',
					primitive: 'math.remap',
					inputs: [
						{ id: 'x', name: 'x', direction: 'in', dataType: 'f32', space: 'body_dir' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [],
			consumers: []
		};

		const result = validateConnection(
			doc,
			{ node: 'n_a', port: 'value' },
			{ node: 'n_b', port: 'x' }
		);
		expect(result.ok).toBe(false);
		expect(result.issues.some((issue) => issue.kind === 'space-mismatch')).toBe(true);
	});

	it('accepts vec2f to vec3f promotion', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'procedural.uv',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'noise.perlin3d',
			position: { x: 100, y: 0 }
		});

		const uvNode = doc.nodes.find((node) => node.primitive === 'procedural.uv')!;
		const perlinNode = doc.nodes.find((node) => node.primitive === 'noise.perlin3d')!;

		const result = validateConnection(
			doc,
			{ node: uvNode.id, port: 'uv' },
			{ node: perlinNode.id, port: 'position' }
		);
		expect(result.ok).toBe(true);
	});

	it('accepts valid f32 connections', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 100, y: 0 }
		});

		const first = doc.nodes[0]!;
		const second = doc.nodes[1]!;

		const result = validateConnection(
			doc,
			{ node: first.id, port: 'value' },
			{ node: second.id, port: 'x' }
		);
		expect(result.ok).toBe(true);

		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: first.id, port: 'value' },
			to: { node: second.id, port: 'x' }
		});
		expect(doc.edges).toHaveLength(1);
	});

	it('replaces an existing edge when connecting to an occupied non-list input', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 100, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 200, y: 0 }
		});

		const first = doc.nodes[0]!;
		const second = doc.nodes[1]!;
		const third = doc.nodes[2]!;

		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: first.id, port: 'value' },
			to: { node: second.id, port: 'x' }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: third.id, port: 'value' },
			to: { node: second.id, port: 'x' }
		});

		expect(doc.edges).toHaveLength(1);
		expect(doc.edges[0]?.from).toEqual({ node: third.id, port: 'value' });
		expect(doc.edges[0]?.to).toEqual({ node: second.id, port: 'x' });
	});

	it('keeps multiple edges on tuple inputs when adding connections', () => {
		let doc = emptyDoc();
		doc = {
			...doc,
			nodes: [
				{
					id: 'n_a',
					primitive: 'constant.f32',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_b',
					primitive: 'constant.f32',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_sum',
					primitive: 'test.listSum',
					inputs: [{ id: 'vals', name: 'vals', direction: 'in', dataType: 'tuple<f32>' }],
					outputs: [{ id: 'out', name: 'out', direction: 'out', dataType: 'f32' }]
				}
			]
		};

		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: 'n_a', port: 'value' },
			to: { node: 'n_sum', port: 'vals' }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: 'n_b', port: 'value' },
			to: { node: 'n_sum', port: 'vals' }
		});

		expect(doc.edges).toHaveLength(2);
		expect(doc.edges.every((edge) => edge.to.port === 'vals')).toBe(true);
	});

	it('removes edges when removing a node', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 100, y: 0 }
		});
		const first = doc.nodes[0]!;
		const second = doc.nodes[1]!;
		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: first.id, port: 'value' },
			to: { node: second.id, port: 'x' }
		});
		expect(doc.edges).toHaveLength(1);

		doc = applyEditIntent(doc, { kind: 'remove-node', nodeId: first.id });
		expect(doc.nodes).toHaveLength(1);
		expect(doc.edges).toHaveLength(0);
	});

	it('removes a single edge', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 100, y: 0 }
		});
		const first = doc.nodes[0]!;
		const second = doc.nodes[1]!;
		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: first.id, port: 'value' },
			to: { node: second.id, port: 'x' }
		});
		const edgeId = doc.edges[0]!.id;

		doc = applyEditIntent(doc, { kind: 'remove-edge', edgeId });
		expect(doc.nodes).toHaveLength(2);
		expect(doc.edges).toHaveLength(0);
	});

	it('removes stale doc.outputs and consumer refs when deleting the referenced node', () => {
		let doc = cosinePaletteEffectGraph();
		expect(doc.outputs).toHaveLength(1);
		expect(doc.outputs[0]?.from.node).toBe('n_effect');

		doc = applyEditIntent(doc, { kind: 'remove-node', nodeId: 'n_effect' });
		expect(doc.outputs).toHaveLength(0);
		expect(doc.consumers).toHaveLength(0);

		const validation = fullValidation(doc);
		expect(validation.ok).toBe(true);
		expect(validation.issues.some((issue) => issue.kind === 'no-output-path')).toBe(false);
		expect(validation.issues.some((issue) => issue.kind === 'dangling-node' && issue.node === 'n_plane')).toBe(
			false
		);
	});

	it('replaceNodePrimitive keeps id and position', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'noise.value2d',
			position: { x: 12, y: 34 }
		});
		const nodeId = doc.nodes[0]!.id;

		doc = applyEditIntent(doc, {
			kind: 'replace-node-primitive',
			nodeId,
			primitiveId: 'noise.worley2d'
		});

		expect(doc.nodes).toHaveLength(1);
		expect(doc.nodes[0]?.id).toBe(nodeId);
		expect(doc.nodes[0]?.position).toEqual({ x: 12, y: 34 });
		expect(doc.nodes[0]?.primitive).toBe('noise.worley2d');
	});

	it('replaceNodePrimitive preserves edges within an identical contract', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'procedural.uv',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'noise.value2d',
			position: { x: 120, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 240, y: 0 }
		});

		const uvNode = doc.nodes.find((node) => node.primitive === 'procedural.uv')!;
		const noiseNode = doc.nodes.find((node) => node.primitive === 'noise.value2d')!;
		const remapNode = doc.nodes.find((node) => node.primitive === 'math.remap')!;

		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: uvNode.id, port: 'uv' },
			to: { node: noiseNode.id, port: 'position' }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: noiseNode.id, port: 'value' },
			to: { node: remapNode.id, port: 'x' }
		});
		expect(doc.edges).toHaveLength(2);

		doc = applyEditIntent(doc, {
			kind: 'replace-node-primitive',
			nodeId: noiseNode.id,
			primitiveId: 'noise.worley2d'
		});

		expect(doc.nodes.find((node) => node.id === noiseNode.id)?.primitive).toBe('noise.worley2d');
		expect(doc.edges).toHaveLength(2);
		expect(doc.edges.some((edge) => edge.to.node === noiseNode.id && edge.to.port === 'position')).toBe(
			true
		);
		expect(
			doc.edges.some((edge) => edge.from.node === noiseNode.id && edge.from.port === 'value')
		).toBe(true);
	});

	it('replaceNodePrimitive drops edges to ports that no longer exist', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'procedural.uv',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'noise.perlin2dDeriv',
			position: { x: 120, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'vector.vec3f.x',
			position: { x: 240, y: 0 }
		});

		const uvNode = doc.nodes.find((node) => node.primitive === 'procedural.uv')!;
		const derivNode = doc.nodes.find((node) => node.primitive === 'noise.perlin2dDeriv')!;
		const splitNode = doc.nodes.find((node) => node.primitive === 'vector.vec3f.x')!;

		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: uvNode.id, port: 'uv' },
			to: { node: derivNode.id, port: 'position' }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: derivNode.id, port: 'sample' },
			to: { node: splitNode.id, port: 'value' }
		});
		expect(doc.edges).toHaveLength(2);

		doc = applyEditIntent(doc, {
			kind: 'replace-node-primitive',
			nodeId: derivNode.id,
			primitiveId: 'noise.value2d'
		});

		expect(doc.edges).toHaveLength(1);
		expect(doc.edges[0]?.to.node).toBe(derivNode.id);
		expect(doc.edges[0]?.to.port).toBe('position');
	});

	it('replaceNodePrimitive drops params absent on the new schema', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'noise.voronoi2d',
			position: { x: 0, y: 0 }
		});
		const nodeId = doc.nodes.find((node) => node.primitive === 'noise.voronoi2d')!.id;
		doc = applyEditIntent(doc, {
			kind: 'set-params',
			nodeId,
			params: { smoothness: 2.5 }
		});
		expect(doc.nodes[0]?.params?.smoothness).toBe(2.5);

		doc = applyEditIntent(doc, {
			kind: 'replace-node-primitive',
			nodeId,
			primitiveId: 'noise.worley2d'
		});

		expect(doc.nodes[0]?.params).toBeUndefined();
	});

	it('allows mulScalar vec2f output to feed worley2d position (fragCoord scale pipeline)', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'host.fragCoord',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'constant.f32',
			position: { x: 0, y: 100 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'vector.mulScalar.vec2f',
			position: { x: 200, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'noise.worley2d',
			position: { x: 420, y: 0 }
		});

		const frag = doc.nodes.find((node) => node.primitive === 'host.fragCoord')!;
		const scalar = doc.nodes.find((node) => node.primitive === 'constant.f32')!;
		const mul = doc.nodes.find((node) => node.primitive === 'vector.mulScalar.vec2f')!;
		const worley = doc.nodes.find((node) => node.primitive === 'noise.worley2d')!;

		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: frag.id, port: 'coord' },
			to: { node: mul.id, port: 'value' }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: scalar.id, port: 'value' },
			to: { node: mul.id, port: 'scalar' }
		});

		const worleyPosition = validateConnection(
			doc,
			{ node: mul.id, port: 'value' },
			{ node: worley.id, port: 'position' }
		);
		expect(worleyPosition.ok).toBe(true);

		doc = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: mul.id, port: 'value' },
			to: { node: worley.id, port: 'position' }
		});
		expect(doc.edges).toHaveLength(3);
	});

	it('add-connected-node wires downstream from an output port', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'vector.vec4f',
			position: { x: 0, y: 0 }
		});
		const source = doc.nodes[0]!;

		doc = applyEditIntent(doc, {
			kind: 'add-connected-node',
			primitiveId: 'vector.vec4f.x',
			position: { x: 220, y: 0 },
			source: { node: source.id, port: 'value' },
			sourceDirection: 'out'
		});

		expect(doc.nodes).toHaveLength(2);
		expect(doc.edges).toHaveLength(1);
		expect(doc.edges[0]?.from).toEqual({ node: source.id, port: 'value' });
		expect(doc.edges[0]?.to.port).toBe('value');
		expect(fullValidation(doc).ok).toBe(true);
	});

	it('add-connected-node wires upstream from an input port', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'math.remap',
			position: { x: 220, y: 0 }
		});
		const target = doc.nodes[0]!;

		doc = applyEditIntent(doc, {
			kind: 'add-connected-node',
			primitiveId: 'constant.f32',
			position: { x: 0, y: 0 },
			source: { node: target.id, port: 'x' },
			sourceDirection: 'in'
		});

		expect(doc.nodes).toHaveLength(2);
		expect(doc.edges).toHaveLength(1);
		expect(doc.edges[0]?.from.port).toBe('value');
		expect(doc.edges[0]?.to).toEqual({ node: target.id, port: 'x' });
		expect(fullValidation(doc).ok).toBe(true);
	});

	it('mints node ids above the loaded document max suffix', () => {
		const loaded: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_noise_worley2d_14',
					primitive: 'noise.worley2d',
					inputs: [
						{ id: 'position', name: 'position', direction: 'in', dataType: 'vec2f' }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [],
			outputs: [],
			consumers: []
		};

		const doc = applyEditIntent(loaded, {
			kind: 'add-node',
			primitiveId: 'noise.worley2d',
			position: { x: 0, y: 0 }
		});

		expect(doc.nodes).toHaveLength(2);
		expect(doc.nodes[1]?.id).toBe('n_noise_worley2d_15');
		expect(new Set(doc.nodes.map((node) => node.id)).size).toBe(2);
	});

	it('mints edge ids above the loaded document max suffix', () => {
		const doc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n_a',
					primitive: 'constant.f32',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_b',
					primitive: 'math.remap',
					inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_c',
					primitive: 'constant.f32',
					inputs: [],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				},
				{
					id: 'n_d',
					primitive: 'math.remap',
					inputs: [{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' }],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
				}
			],
			edges: [{ id: 'e_8', from: { node: 'n_a', port: 'value' }, to: { node: 'n_b', port: 'x' } }],
			outputs: [],
			consumers: []
		};
		const next = applyEditIntent(doc, {
			kind: 'add-edge',
			from: { node: 'n_c', port: 'value' },
			to: { node: 'n_d', port: 'x' }
		});
		expect(next.edges.map((edge) => edge.id)).toEqual(['e_8', 'e_9']);
	});

	it('sets a node display name through applyEditIntent', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'noise.perlin3d',
			position: { x: 0, y: 0 }
		});
		const nodeId = doc.nodes[0]!.id;

		doc = applyEditIntent(doc, { kind: 'set-name', nodeId, name: '  Perlin A  ' });
		expect(doc.nodes[0]?.name).toBe('Perlin A');

		doc = applyEditIntent(doc, { kind: 'set-name', nodeId, name: '   ' });
		expect(doc.nodes[0]?.name).toBeUndefined();
	});

	it('graphToFlow uses custom name or falls back to primitive id', () => {
		let doc = applyEditIntent(emptyDoc(), {
			kind: 'add-node',
			primitiveId: 'noise.perlin3d',
			position: { x: 0, y: 0 }
		});
		doc = applyEditIntent(doc, {
			kind: 'add-node',
			primitiveId: 'noise.perlin3d',
			position: { x: 120, y: 0 }
		});

		const [first, second] = doc.nodes;
		doc = applyEditIntent(doc, { kind: 'set-name', nodeId: first!.id, name: 'Layer A' });

		const flow = graphToFlow(doc);
		expect(flow.nodes.find((node) => node.id === first!.id)?.data.label).toBe('Layer A');
		expect(flow.nodes.find((node) => node.id === second!.id)?.data.label).toBe('noise.perlin3d');
		expect(nodeDisplayLabel({ name: '  ', primitive: 'noise.perlin3d' })).toBe('noise.perlin3d');
	});
});
