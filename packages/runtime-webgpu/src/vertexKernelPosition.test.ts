import { getPrimitive, paramInputPorts, type GraphDocument, type Node, type Port, type PortSpec } from '@world-lab/graph';
import { describe, expect, it } from 'vitest';

import { createStandardLibraryResolver } from './moduleResolver.js';
import { assembleVertexKernelPositionModuleAsync } from './vertexKernelPosition.js';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		...(spec.type !== undefined ? { type: spec.type } : {}),
		dataType: spec.dataType,
		space: spec.space ?? 'none'
	}));
}

function snapshotNode(
	id: string,
	primitiveId: string,
	params?: Record<string, unknown>
): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	return {
		id,
		primitive: primitiveId,
		inputs: [
			...instantiatePorts(primitive.inputs, 'in'),
			...instantiatePorts(paramInputPorts(primitive), 'in')
		],
		outputs: instantiatePorts(primitive.outputs, 'out'),
		...(params !== undefined ? { params } : {})
	};
}

async function expectVertexModuleLinks(graph: GraphDocument, output = { node: 'n_pos', port: 'position' }): Promise<string> {
	const { requestGpuDevice } = await import('./device.js');
	const assembly = await assembleVertexKernelPositionModuleAsync({
		graph,
		output,
		resolver: createStandardLibraryResolver()
	});

	expect(assembly.vertexCount).toBe(6);
	expect(assembly.code).toContain('fn plane_grid_position');
	expect(assembly.code).toContain('plane_grid_position(vid, 2u, 2u, 2.0, 2.0, 0.0, 0.0, 0.0)');
	expect(assembly.code).toContain('return vec4f(');
	expect(assembly.code).toContain(', 1.0);');

	const { device } = await requestGpuDevice();
	try {
		const vertexModule = device.createShaderModule({ code: assembly.code });
		const vertexInfo = await vertexModule.getCompilationInfo();
		expect(vertexInfo.messages.filter((message) => message.type === 'error')).toEqual([]);

		const fragmentModule = device.createShaderModule({
			code: `@fragment
fn fs_main() -> @location(0) vec4f {
	return vec4f(1.0);
}`
		});
		const fragmentInfo = await fragmentModule.getCompilationInfo();
		expect(fragmentInfo.messages.filter((message) => message.type === 'error')).toEqual([]);

		const pipeline = await device.createRenderPipelineAsync({
			label: 'vertex-kernel-position-device-compile',
			layout: 'auto',
			vertex: { module: vertexModule, entryPoint: 'vs_main' },
			fragment: {
				module: fragmentModule,
				entryPoint: 'fs_main',
				targets: [{ format: 'rgba8unorm' }]
			},
			primitive: { topology: 'triangle-list' }
		});
		expect(pipeline).toBeDefined();
	} finally {
		device.destroy();
	}

	return assembly.code;
}

describe('@world-lab/runtime-webgpu vertex kernel position assembly', () => {
	it.skipIf(!hasWebGPU)('assembles metricPosition passthrough into linkable vertex WGSL', async () => {
		const graph: GraphDocument = {
			version: '2',
			nodes: [snapshotNode('n_pos', 'procedural.metricPosition')],
			edges: [],
			outputs: [{ name: 'position', from: { node: 'n_pos', port: 'position' } }]
		};

		const code = await expectVertexModuleLinks(graph);
		expect(code).toContain('let v_n_pos_position: vec3<f32> = plane_grid_position(');
		expect(code).toContain('vec4f(v_n_pos_position, 1.0)');
	});

	it.skipIf(!hasWebGPU)('assembles graph-authored position math into linkable vertex WGSL', async () => {
		const graph: GraphDocument = {
			version: '2',
			nodes: [
				snapshotNode('n_pos', 'procedural.metricPosition'),
				snapshotNode('n_x', 'constant.f32', { value: 0.1 }),
				snapshotNode('n_y', 'constant.f32', { value: 0 }),
				snapshotNode('n_z', 'constant.f32', { value: 0 }),
				snapshotNode('n_offset', 'vector.vec3f'),
				snapshotNode('n_translate', 'transform.translate')
			],
			edges: [
				{ id: 'e_pos_translate', from: { node: 'n_pos', port: 'position' }, to: { node: 'n_translate', port: 'position' } },
				{ id: 'e_x_offset', from: { node: 'n_x', port: 'value' }, to: { node: 'n_offset', port: 'x' } },
				{ id: 'e_y_offset', from: { node: 'n_y', port: 'value' }, to: { node: 'n_offset', port: 'y' } },
				{ id: 'e_z_offset', from: { node: 'n_z', port: 'value' }, to: { node: 'n_offset', port: 'z' } },
				{ id: 'e_offset_translate', from: { node: 'n_offset', port: 'value' }, to: { node: 'n_translate', port: 'offset' } }
			],
			outputs: [{ name: 'position', from: { node: 'n_translate', port: 'position' } }]
		};

		const code = await expectVertexModuleLinks(graph, { node: 'n_translate', port: 'position' });
		expect(code).toContain('fn makeVec3f(');
		expect(code).toContain('fn translate(');
		expect(code).toContain('vec4f(v_n_translate_position, 1.0)');
	});
});
