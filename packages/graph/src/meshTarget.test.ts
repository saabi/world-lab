import { describe, expect, it } from 'vitest';

import { deriveMeshTargets, isMeshTarget } from './meshTarget.js';
import { getPrimitive } from './registry.js';
import type { GraphDocument, Node, Port, PortRef } from './types.js';
import type { PortSpec } from './primitive.js';

import './primitives/index.js';

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

function portRef(nodeId: string, port: string): PortRef {
	return { node: nodeId, port };
}

describe('mesh target derivation', () => {
	it('registers target.mesh with meshTarget role', () => {
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

	it('derives a complete mesh target with wired position and normal', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [
				snapshotNode('n_uv', 'procedural.uv'),
				snapshotNode('n_plane', 'surface.plane'),
				snapshotNode('n_mesh', 'target.mesh', { gridSize: 16, faceCount: 6 })
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

		const meshNode = graph.nodes.find((node) => node.id === 'n_mesh')!;
		expect(isMeshTarget(meshNode)).toBe(true);

		expect(deriveMeshTargets(graph)).toEqual([
			{
				meshNodeId: 'n_mesh',
				position: portRef('n_plane', 'position'),
				normal: portRef('n_plane', 'normal'),
				gridSize: 16,
				faceCount: 6
			}
		]);

		const implementation = getPrimitive('target.mesh')!.implementation;
		expect(implementation.kind).toBe('sink');
		if (implementation.kind !== 'sink') return;
		const invocation = implementation.sink.deriveInvocation(graph, meshNode);
		expect(invocation?.dependencies).toEqual([
			portRef('n_plane', 'position'),
			portRef('n_plane', 'normal')
		]);
		expect(invocation?.payload).toEqual(deriveMeshTargets(graph)[0]);
	});

	it('skips mesh targets missing the normal input', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [
				snapshotNode('n_plane', 'surface.plane'),
				snapshotNode('n_mesh', 'target.mesh')
			],
			edges: [
				{
					id: 'e_pos',
					from: portRef('n_plane', 'position'),
					to: portRef('n_mesh', 'position')
				}
			],
			outputs: [],
			consumers: []
		};

		expect(deriveMeshTargets(graph)).toEqual([]);
	});

	it('uses default gridSize and faceCount when params are absent', () => {
		const graph: GraphDocument = {
			version: '1',
			nodes: [
				snapshotNode('n_plane', 'surface.plane'),
				snapshotNode('n_mesh', 'target.mesh')
			],
			edges: [
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

		expect(deriveMeshTargets(graph)[0]).toMatchObject({
			gridSize: 24,
			faceCount: 1
		});
	});
});
