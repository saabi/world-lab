import {
	assembleStageEntry,
	type ConsumerShader,
	type VaryingDecl
} from '@world-lab/compiler';
import { describe, expect, it } from 'vitest';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

describe('kernel varyings device compile', () => {
	it.skipIf(!hasWebGPU)('links a shared varyings struct across a vertex/fragment pair', async () => {
		const { requestGpuDevice } = await import('./device.js');
		const vertexShader: ConsumerShader = {
			consumerId: 'v',
			stage: 'vertex',
			outputs: ['position'],
			code: 'fn vertex_pos() -> vec4f { return vec4f(0.0, 0.0, 0.0, 1.0); }\nfn vertex_uv() -> vec2f { return vec2f(0.0, 0.0); }',
			moduleIds: []
		};
		const fragmentShader: ConsumerShader = {
			consumerId: 'f',
			stage: 'fragment',
			outputs: ['color'],
			code: 'fn frag_color(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }',
			moduleIds: []
		};
		const varyings: VaryingDecl[] = [{ name: 'uv', wgslType: 'vec2f' }];

		const vertex = assembleStageEntry(vertexShader, {
			output: 'position',
			outputFns: { position: 'vertex_pos', uv: 'vertex_uv' },
			varyings
		});
		const fragment = assembleStageEntry(fragmentShader, {
			output: 'color',
			outputFns: { color: 'frag_color' },
			callArgs: ['input.uv'],
			varyings
		});
		const code = `${vertex.code}\n\n${fragment.code}`;

		const { device } = await requestGpuDevice();
		try {
			const module = device.createShaderModule({ code });
			const info = await module.getCompilationInfo();
			expect(info.messages.filter((message) => message.type === 'error')).toEqual([]);

			const pipeline = await device.createRenderPipelineAsync({
				label: 'kernel-varyings-device-compile',
				layout: 'auto',
				vertex: { module, entryPoint: 'vs_main' },
				fragment: {
					module,
					entryPoint: 'fs_main',
					targets: [{ format: 'rgba8unorm' }]
				},
				primitive: { topology: 'triangle-list' }
			});
			expect(pipeline).toBeDefined();
		} finally {
			device.destroy();
		}
	});
});
