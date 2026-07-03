import { describe, expect, it } from 'vitest';

import {
	indexFormatForTemplate,
	validateInstancedMeshDrawInput,
	type RenderInstancedMeshInput
} from './instancedMeshDraw.js';

function baseInput(overrides: Partial<RenderInstancedMeshInput> = {}): RenderInstancedMeshInput {
	return {
		device: {} as GPUDevice,
		pass: {} as GPURenderPassEncoder,
		format: 'rgba8unorm',
		label: 'test-instanced-mesh',
		shaderCode: '@vertex fn vs() {} @fragment fn fs() {}',
		uniformBuffer: {} as GPUBuffer,
		template: {
			positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
			normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0]),
			indices: new Uint16Array([0, 1, 2])
		},
		instanceBuffer: {} as GPUBuffer,
		instanceLayout: {
			arrayStride: 16,
			attributes: [
				{ shaderLocation: 2, offset: 0, format: 'float32x3' },
				{ shaderLocation: 3, offset: 12, format: 'float32' }
			]
		},
		instanceCount: 2,
		...overrides
	};
}

describe('instancedMeshDraw validation', () => {
	it('accepts a valid draw input', () => {
		expect(() => validateInstancedMeshDrawInput(baseInput())).not.toThrow();
	});

	it('allows zero instances without validating template topology', () => {
		expect(() =>
			validateInstancedMeshDrawInput(
				baseInput({
					instanceCount: 0,
					template: {
						positions: new Float32Array(),
						normals: new Float32Array(),
						indices: new Uint16Array()
					}
				})
			)
		).not.toThrow();
	});

	it('rejects negative instance counts', () => {
		expect(() => validateInstancedMeshDrawInput(baseInput({ instanceCount: -1 }))).toThrow(RangeError);
	});

	it('rejects mismatched template normals', () => {
		expect(() =>
			validateInstancedMeshDrawInput(
				baseInput({
					template: {
						positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
						normals: new Float32Array([0, 1, 0]),
						indices: new Uint16Array([0, 1, 2])
					}
				})
			)
		).toThrow(/normals must match positions length/);
	});

	it('rejects instance attributes that fall outside the stride', () => {
		expect(() =>
			validateInstancedMeshDrawInput(
				baseInput({
					instanceLayout: {
						arrayStride: 12,
						attributes: [{ shaderLocation: 2, offset: 12, format: 'float32x3' }]
					}
				})
			)
		).toThrow(/attribute offset must fall within stride/);
	});

	it('selects index format from the template index array type', () => {
		expect(indexFormatForTemplate(new Uint16Array([0, 1, 2]))).toBe('uint16');
		expect(indexFormatForTemplate(new Uint32Array([0, 1, 2]))).toBe('uint32');
	});
});
