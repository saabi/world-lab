import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { getPrimitive, type GraphDocument, type Node, type Port, type PortRef, type PortSpec } from '@world-lab/graph';
import {
	assembleFullscreenFragmentModuleAsync,
	executeFullscreenFragment
} from './fullscreenFragment.js';
import { createStandardLibraryResolver } from '../moduleResolver.js';
import {
	cosinePaletteAtOrigin,
	packShaderToyUniforms,
	SHADERTOY_UNIFORM_BYTE_LENGTH,
	SHADERTOY_UNIFORM_OFFSETS
} from './shadertoyUniforms.js';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

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

function cosinePaletteEffectGraph(): GraphDocument {
	return {
		version: '2',
		nodes: [
			snapshotNode('n_frag', 'host.fragCoord'),
			snapshotNode('n_res', 'host.iResolution'),
			snapshotNode('n_time', 'host.iTime'),
			snapshotNode('n_effect', 'effect.cosinePalette')
		],
		edges: [
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
			}
		],
		outputs: [{ name: 'image', from: portRef('n_effect', 'effect.cosinePalette', 'out', 0) }],
	};
}

function cosinePaletteEffectOutput(): PortRef {
	return portRef('n_effect', 'effect.cosinePalette', 'out', 0);
}

function constantVec4FragmentGraph(): GraphDocument {
	const constOut = portRef('n_const', 'constant.f32', 'out', 0);
	const vec4In = (index: number) => portRef('n_vec4', 'vector.vec4f', 'in', index);
	return {
		version: '2',
		nodes: [
			snapshotNode('n_const', 'constant.f32', { value: 0.75 }),
			snapshotNode('n_vec4', 'vector.vec4f')
		],
		edges: [
			{ id: 'e_const_x', from: constOut, to: vec4In(0) },
			{ id: 'e_const_y', from: constOut, to: vec4In(1) },
			{ id: 'e_const_z', from: constOut, to: vec4In(2) },
			{ id: 'e_const_w', from: constOut, to: vec4In(3) }
		],
		outputs: [{ name: 'image', from: portRef('n_vec4', 'vector.vec4f', 'out', 0) }],
	};
}

function constantVec4FragmentOutput(): PortRef {
	return portRef('n_vec4', 'vector.vec4f', 'out', 0);
}

async function validateWgslModule(code: string): Promise<string | null> {
	if (!hasWebGPU) return null;
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) return null;
	const device = await adapter.requestDevice();
	try {
		const module = device.createShaderModule({ code });
		const info = await module.getCompilationInfo();
		const errors = info.messages.filter((message) => message.type === 'error');
		if (errors.length === 0) return null;
		return errors.map((message) => message.message).join('; ');
	} finally {
		device.destroy();
	}
}

describe('@world-lab/runtime-webgpu shadertoyUniforms', () => {
	it('packs iResolution and iTime at the expected offsets', () => {
		const buffer = packShaderToyUniforms({
			width: 320,
			height: 180,
			iTime: 1.5,
			iMouse: [0.25, 0.5, 1, 0],
			iFrame: 42
		});
		expect(buffer.byteLength).toBe(SHADERTOY_UNIFORM_BYTE_LENGTH);

		const f32 = new Float32Array(buffer);
		const u32 = new Uint32Array(buffer);
		expect(f32[SHADERTOY_UNIFORM_OFFSETS.iResolution / 4]).toBe(320);
		expect(f32[SHADERTOY_UNIFORM_OFFSETS.iResolution / 4 + 1]).toBe(180);
		expect(f32[SHADERTOY_UNIFORM_OFFSETS.iTime / 4]).toBeCloseTo(1.5);
		expect(f32[SHADERTOY_UNIFORM_OFFSETS.iMouse / 4]).toBeCloseTo(0.25);
		expect(f32[SHADERTOY_UNIFORM_OFFSETS.iMouse / 4 + 1]).toBeCloseTo(0.5);
		expect(u32[SHADERTOY_UNIFORM_OFFSETS.iFrame / 4]).toBe(42);
	});
});

describe('@world-lab/runtime-webgpu fullscreenFragment assembly', () => {
	it('includes node-driven vertex grid, fragment entry, uniform block, and cosine_palette call', async () => {
		const graph = cosinePaletteEffectGraph();
		const output = cosinePaletteEffectOutput();
		const { code, vertexCount, usesShaderToyHost } = await assembleFullscreenFragmentModuleAsync(
			graph,
			output,
			createStandardLibraryResolver()
		);

		expect(usesShaderToyHost).toBe(true);
		expect(vertexCount).toBe(6);
		expect(code).toContain('struct ShaderToyUniforms');
		expect(code).toContain('@group(0) @binding(0) var<uniform> u: ShaderToyUniforms;');
		expect(code).toContain('fn plane_grid_position(');
		expect(code).toContain('@vertex');
		expect(code).toContain('fn vs_main');
		expect(code).toContain('plane_grid_position(vid, 2u, 2u, 2.0, 2.0, 0.0, 0.0, 0.0)');
		expect(code).toContain('@fragment');
		expect(code).toContain('fn fs_main');
		expect(code).toContain('fn cosine_palette(');
		expect(code).toContain('position.xy');
		expect(code).toContain('u.iResolution');
		expect(code).toContain('u.iTime');
		// Scope guard (regression): the eval fn must take `position` and the entry must
		// pass it — `position.xy` in the body is otherwise out of scope (invalid WGSL).
		expect(code).toContain('fn graph_eval_image(position: vec4f)');
		expect(code).toContain('graph_eval_image(position)');
		expect(code).not.toContain('struct GraphParams');
		expect(code).not.toContain('@group(0) @binding(1) var<uniform> params: GraphParams;');
	});

	it('declares GraphParams for a constant.f32 param node and device-compiles', async () => {
		const graph = constantVec4FragmentGraph();
		const output = constantVec4FragmentOutput();
		const { code, params, usesShaderToyHost } = await assembleFullscreenFragmentModuleAsync(
			graph,
			output,
			createStandardLibraryResolver()
		);

		expect(usesShaderToyHost).toBe(false);
		expect(params.some((field) => field.nodeId === 'n_const' && field.paramName === 'value')).toBe(
			true
		);
		expect(code).toContain('struct GraphParams');
		expect(code).toContain('p_n_const_value');
		expect(code).toContain('params.p_n_const_value');
		expect(code).not.toContain('ShaderToyUniforms');
		expect(code).toContain('@group(0) @binding(0) var<uniform> params: GraphParams;');
		expect(code).not.toContain('@group(0) @binding(1) var<uniform> params: GraphParams;');

		const wgslError = await validateWgslModule(code);
		expect(wgslError).toBeNull();
	});
});

describe('@world-lab/runtime-webgpu executeFullscreenFragment', () => {
	it.skipIf(!hasWebGPU)('returns RGBA8 matching cosine palette at origin when iTime=0', async () => {
		const adapter = await navigator.gpu.requestAdapter();
		expect(adapter).toBeTruthy();
		const device = await adapter!.requestDevice();

		const graph = cosinePaletteEffectGraph();
		const output = cosinePaletteEffectOutput();
		const width = 64;
		const height = 64;

		const result = await executeFullscreenFragment({
			device,
			graph,
			output,
			width,
			height,
			host: { iTime: 0, iFrame: 0, iMouse: [0, 0, 0, 0] }
		});

		expect(result.width).toBe(width);
		expect(result.height).toBe(height);
		expect(result.pixels.byteLength).toBe(width * height * 4);

		const expected = cosinePaletteAtOrigin(width, height);
		const actual = [result.pixels[0]!, result.pixels[1]!, result.pixels[2]!, result.pixels[3]!];
		for (let i = 0; i < 4; i++) {
			expect(actual[i]).toBeGreaterThanOrEqual(expected[i]! - 2);
			expect(actual[i]).toBeLessThanOrEqual(expected[i]! + 2);
		}

		device.destroy();
	});

	it.skipIf(!hasWebGPU)('executes a constant.f32 fragment graph without pipeline errors', async () => {
		const adapter = await navigator.gpu.requestAdapter();
		expect(adapter).toBeTruthy();
		const device = await adapter!.requestDevice();

		const graph = constantVec4FragmentGraph();
		const output = constantVec4FragmentOutput();

		const result = await executeFullscreenFragment({
			device,
			graph,
			output,
			width: 32,
			height: 32,
			host: { iTime: 0, iFrame: 0, iMouse: [0, 0, 0, 0] }
		});

		expect(result.pixels.byteLength).toBe(32 * 32 * 4);
		expect(result.pixels[0]).toBeGreaterThan(0);

		device.destroy();
	});
});
