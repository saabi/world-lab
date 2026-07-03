import {
	getPrimitive,
	registerPrimitive,
	type NodePrimitive,
	type NodePrimitiveInput,
	typeRefToWgsl
} from '@world-lab/graph';
import { Type } from '@world-lab/schema';
import { describe, expect, it } from 'vitest';

const hasWebGPU =
	typeof globalThis.navigator !== 'undefined' &&
	'gpu' in globalThis.navigator &&
	globalThis.navigator.gpu !== undefined;

const INTEGER_ID = 'test.f1_5_i32';
const MATRIX_ID = 'test.f1_5_mat3';

const TEST_PRIMITIVES: NodePrimitiveInput[] = [
	{
		id: INTEGER_ID,
		category: 'test',
		inputs: [{ name: 'value', type: { kind: 'scalar', scalar: 'i32' } }],
		outputs: [{ name: 'result', type: { kind: 'scalar', scalar: 'i32' } }],
		params: Type.Object({}),
		wgsl: { moduleId: INTEGER_ID, entry: 'f1_5_i32' },
		evalCPU: ({ inputs }) => ({ result: inputs.value! })
	},
	{
		id: MATRIX_ID,
		category: 'test',
		inputs: [
			{
				name: 'value',
				type: { kind: 'matrix', element: 'f32', columns: 3, rows: 3 }
			}
		],
		outputs: [
			{
				name: 'result',
				type: { kind: 'matrix', element: 'f32', columns: 3, rows: 3 }
			}
		],
		params: Type.Object({}),
		wgsl: { moduleId: MATRIX_ID, entry: 'f1_5_mat3' },
		evalCPU: ({ inputs }) => ({ result: inputs.value! })
	}
];

function testPrimitive(id: string): NodePrimitive {
	const existing = getPrimitive(id);
	if (existing) return existing;
	const input = TEST_PRIMITIVES.find((primitive) => primitive.id === id)!;
	registerPrimitive(input);
	return getPrimitive(id)!;
}

function testShader(): string {
	const integer = testPrimitive(INTEGER_ID);
	const matrix = testPrimitive(MATRIX_ID);
	const integerType = typeRefToWgsl(integer.inputs[0]!.type!);
	const matrixType = typeRefToWgsl(matrix.inputs[0]!.type!);
	return `
fn ${integer.wgsl.entry}(value: ${integerType}) -> ${integerType} {
	return value;
}

fn ${matrix.wgsl.entry}(value: ${matrixType}) -> ${matrixType} {
	return value;
}

@compute @workgroup_size(1)
fn main() {
	let integerResult: ${integerType} = ${integer.wgsl.entry}(7i);
	let matrixResult: ${matrixType} = ${matrix.wgsl.entry}(
		mat3x3<f32>(
			vec3<f32>(1.0, 0.0, 0.0),
			vec3<f32>(0.0, 1.0, 0.0),
			vec3<f32>(0.0, 0.0, 1.0)
		)
	);
}
`;
}

describe('integer and matrix TypeRef primitives', () => {
	it('round-trips values through test-only CPU evaluators and emits WGSL types', () => {
		const integer = testPrimitive(INTEGER_ID);
		const matrix = testPrimitive(MATRIX_ID);
		const matrixValue = [1, 0, 0, 0, 1, 0, 0, 0, 1];

		expect(integer.evalCPU?.({ inputs: { value: 7 }, params: {} })).toEqual({ result: 7 });
		expect(matrix.evalCPU?.({ inputs: { value: matrixValue }, params: {} })).toEqual({
			result: matrixValue
		});
		expect(testShader()).toContain('value: i32');
		expect(testShader()).toContain('value: mat3x3<f32>');
	});

	it.skipIf(!hasWebGPU)('compiles integer and matrix primitives on a real device', async () => {
		const { requestGpuDevice } = await import('./device.js');
		const { device } = await requestGpuDevice();
		try {
			const module = device.createShaderModule({ code: testShader() });
			const info = await module.getCompilationInfo();
			expect(info.messages.filter((message) => message.type === 'error')).toEqual([]);
			await device.createComputePipelineAsync({
				layout: 'auto',
				compute: { module, entryPoint: 'main' }
			});
		} finally {
			device.destroy();
		}
	});
});
