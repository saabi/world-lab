import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { getPrimitive, type GraphDocument, type Node, type Port, type PortRef, type PortSpec } from '@world-lab/graph';

import {
	assembleFullscreenFragmentModuleAsync,
	wgslReferencesShaderToyUniform
} from './fullscreenFragment.js';
import { createStandardLibraryResolver } from '../moduleResolver.js';

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
		...(params !== undefined ? { params } : {}),
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

describe('wgslReferencesShaderToyUniform', () => {
	it('detects reads of u.iResolution and u.iTime', () => {
		expect(wgslReferencesShaderToyUniform('let x = u.iResolution;')).toBe(true);
		expect(wgslReferencesShaderToyUniform('let t = u.iTime;')).toBe(true);
		expect(wgslReferencesShaderToyUniform('let p = position.xy;')).toBe(false);
	});
});

describe('fullscreenFragment ShaderToy binding selection', () => {
	it('omits ShaderToy binding when host nodes exist but are not in the output slice', async () => {
		const constOut = portRef('n_const', 'constant.f32', 'out', 0);
		const vec4In = (index: number) => portRef('n_vec4', 'vector.vec4f', 'in', index);
		const graph: GraphDocument = {
			version: '2',
			nodes: [
				snapshotNode('n_const', 'constant.f32', { value: 0.5 }),
				snapshotNode('n_vec4', 'vector.vec4f'),
				snapshotNode('n_frag', 'host.fragCoord'),
				snapshotNode('n_res', 'host.iResolution'),
				snapshotNode('n_time', 'host.iTime')
			],
			edges: [
				{ id: 'e_const_x', from: constOut, to: vec4In(0) },
				{ id: 'e_const_y', from: constOut, to: vec4In(1) },
				{ id: 'e_const_z', from: constOut, to: vec4In(2) },
				{ id: 'e_const_w', from: constOut, to: vec4In(3) }
			],
			outputs: [{ name: 'image', from: portRef('n_vec4', 'vector.vec4f', 'out', 0) }],
		};

		const { usesShaderToyHost, code } = await assembleFullscreenFragmentModuleAsync(
			graph,
			portRef('n_vec4', 'vector.vec4f', 'out', 0),
			createStandardLibraryResolver()
		);

		expect(usesShaderToyHost).toBe(false);
		expect(code).not.toContain('ShaderToyUniforms');
		expect(code).toContain('@group(0) @binding(0) var<uniform> params: GraphParams;');
	});
});
