import { quantity, Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

type VectorType = 'vec2f' | 'vec3f' | 'vec4f';

const VECTOR_SPECS = [
	{ type: 'vec2f', size: 2 },
	{ type: 'vec3f', size: 3 },
	{ type: 'vec4f', size: 4 }
] as const satisfies readonly { type: VectorType; size: number }[];

function vectorValues(value: unknown, size: number): number[] {
	const vector = Array.isArray(value) ? value : [];
	return Array.from({ length: size }, (_, index) => Number(vector[index] ?? 0));
}

function dot(a: readonly number[], b: readonly number[]): number {
	return a.reduce((sum, component, index) => sum + component * (b[index] ?? 0), 0);
}

function entrySuffix(inputType: VectorType): string {
	return inputType.replace('v', 'V');
}

const constantF32: NodePrimitive = {
	id: 'constant.f32',
	category: 'constant',
	inputs: [],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({
		value: quantity('none', { default: 0, description: 'Scalar value' })
	}),
	wgsl: {
		moduleId: 'constant.f32',
		entry: 'constantF32',
		arguments: [{ name: 'value', source: 'param' }]
	},
	metadata: {
		description: 'Authored scalar f32 constant.',
		pure: true,
		deterministic: true,
		role: 'constant'
	},
	evalCPU(ctx) {
		return { value: ctx.params.value as number };
	}
};

const vec2f: NodePrimitive = {
	id: 'vector.vec2f',
	category: 'vector',
	inputs: [
		{ name: 'x', dataType: 'f32', default: 0 },
		{ name: 'y', dataType: 'f32', default: 0 }
	],
	outputs: [{ name: 'value', dataType: 'vec2f' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'vector.vec2f', entry: 'makeVec2f' },
	metadata: { description: 'Construct a vec2f from scalar components.', pure: true, deterministic: true },
	evalCPU(ctx) {
		return { value: [ctx.inputs.x as number, ctx.inputs.y as number] };
	}
};

const vec3f: NodePrimitive = {
	id: 'vector.vec3f',
	category: 'vector',
	inputs: [
		{ name: 'x', dataType: 'f32', default: 0 },
		{ name: 'y', dataType: 'f32', default: 0 },
		{ name: 'z', dataType: 'f32', default: 0 }
	],
	outputs: [{ name: 'value', dataType: 'vec3f' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'vector.vec3f', entry: 'makeVec3f' },
	metadata: { description: 'Construct a vec3f from scalar components.', pure: true, deterministic: true },
	evalCPU(ctx) {
		return { value: [ctx.inputs.x as number, ctx.inputs.y as number, ctx.inputs.z as number] };
	}
};

const vec4f: NodePrimitive = {
	id: 'vector.vec4f',
	category: 'vector',
	inputs: [
		{ name: 'x', dataType: 'f32', default: 0 },
		{ name: 'y', dataType: 'f32', default: 0 },
		{ name: 'z', dataType: 'f32', default: 0 },
		{ name: 'w', dataType: 'f32', default: 1 }
	],
	outputs: [{ name: 'value', dataType: 'vec4f' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'vector.vec4f', entry: 'makeVec4f' },
	metadata: { description: 'Construct a vec4f from scalar components.', pure: true, deterministic: true },
	evalCPU(ctx) {
		return {
			value: [
				ctx.inputs.x as number,
				ctx.inputs.y as number,
				ctx.inputs.z as number,
				ctx.inputs.w as number
			]
		};
	}
};

function componentPrimitive(
	id: string,
	inputType: 'vec2f' | 'vec3f' | 'vec4f',
	component: 'x' | 'y' | 'z' | 'w',
	index: number
): NodePrimitive {
	return {
		id,
		category: 'vector',
		inputs: [{ name: 'value', dataType: inputType }],
		outputs: [{ name: component, dataType: 'f32' }],
		params: Type.Object({}),
		wgsl: { moduleId: id, entry: `${inputType}${component.toUpperCase()}` },
		metadata: {
			description: `Extract ${component} from ${inputType}.`,
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			const value = ctx.inputs.value as number[];
			return { [component]: value[index] ?? 0 };
		}
	};
}

function binaryVectorPrimitive(
	operation: 'add' | 'sub',
	inputType: VectorType,
	size: number
): NodePrimitive {
	const id = `vector.${operation}.${inputType}`;
	return {
		id,
		category: 'vector',
		inputs: [
			{ name: 'a', dataType: inputType },
			{ name: 'b', dataType: inputType }
		],
		outputs: [{ name: 'value', dataType: inputType }],
		params: Type.Object({}),
		wgsl: { moduleId: id, entry: `${operation}${entrySuffix(inputType)}` },
		metadata: {
			description: `${operation === 'add' ? 'Add' : 'Subtract'} ${inputType} values component-wise.`,
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			const a = vectorValues(ctx.inputs.a, size);
			const b = vectorValues(ctx.inputs.b, size);
			const value = a.map((component, index) =>
				operation === 'add' ? component + b[index]! : component - b[index]!
			);
			return { value };
		}
	};
}

function scalarVectorPrimitive(
	operation: 'mulScalar' | 'divScalar',
	inputType: VectorType,
	size: number
): NodePrimitive {
	const id = `vector.${operation}.${inputType}`;
	return {
		id,
		category: 'vector',
		inputs: [
			{ name: 'value', dataType: inputType },
			{ name: 'scalar', dataType: 'f32' }
		],
		outputs: [{ name: 'value', dataType: inputType }],
		params: Type.Object({}),
		wgsl: { moduleId: id, entry: `${operation}${entrySuffix(inputType)}` },
		metadata: {
			description: `${operation === 'mulScalar' ? 'Multiply' : 'Divide'} ${inputType} by a scalar.`,
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			const value = vectorValues(ctx.inputs.value, size);
			const scalar = Number(ctx.inputs.scalar ?? 0);
			return {
				value: value.map((component) =>
					operation === 'mulScalar' ? component * scalar : component / scalar
				)
			};
		}
	};
}

function dotPrimitive(inputType: VectorType, size: number): NodePrimitive {
	const id = `vector.dot.${inputType}`;
	return {
		id,
		category: 'vector',
		inputs: [
			{ name: 'a', dataType: inputType },
			{ name: 'b', dataType: inputType }
		],
		outputs: [{ name: 'value', dataType: 'f32' }],
		params: Type.Object({}),
		wgsl: { moduleId: id, entry: `dot${entrySuffix(inputType)}` },
		metadata: {
			description: `Dot product of two ${inputType} values.`,
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			return { value: dot(vectorValues(ctx.inputs.a, size), vectorValues(ctx.inputs.b, size)) };
		}
	};
}

function lengthPrimitive(inputType: VectorType, size: number): NodePrimitive {
	const id = `vector.length.${inputType}`;
	return {
		id,
		category: 'vector',
		inputs: [{ name: 'value', dataType: inputType }],
		outputs: [{ name: 'value', dataType: 'f32' }],
		params: Type.Object({}),
		wgsl: { moduleId: id, entry: `length${entrySuffix(inputType)}` },
		metadata: {
			description: `Length of a ${inputType} value.`,
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			const value = vectorValues(ctx.inputs.value, size);
			return { value: Math.sqrt(dot(value, value)) };
		}
	};
}

function normalizePrimitive(inputType: VectorType, size: number): NodePrimitive {
	const id = `vector.normalize.${inputType}`;
	return {
		id,
		category: 'vector',
		inputs: [{ name: 'value', dataType: inputType }],
		outputs: [{ name: 'value', dataType: inputType }],
		params: Type.Object({}),
		wgsl: { moduleId: id, entry: `normalize${entrySuffix(inputType)}` },
		metadata: {
			description: `Normalize a ${inputType} value.`,
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			const value = vectorValues(ctx.inputs.value, size);
			const magnitude = Math.sqrt(dot(value, value));
			return { value: magnitude === 0 ? value.map(() => 0) : value.map((component) => component / magnitude) };
		}
	};
}

function mixPrimitive(inputType: VectorType, size: number): NodePrimitive {
	const id = `vector.mix.${inputType}`;
	return {
		id,
		category: 'vector',
		inputs: [
			{ name: 'a', dataType: inputType },
			{ name: 'b', dataType: inputType },
			{ name: 't', dataType: 'f32' }
		],
		outputs: [{ name: 'value', dataType: inputType }],
		params: Type.Object({}),
		wgsl: { moduleId: id, entry: `mix${entrySuffix(inputType)}` },
		metadata: {
			description: `Linearly interpolate between two ${inputType} values.`,
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			const a = vectorValues(ctx.inputs.a, size);
			const b = vectorValues(ctx.inputs.b, size);
			const t = Number(ctx.inputs.t ?? 0);
			return { value: a.map((component, index) => component * (1 - t) + b[index]! * t) };
		}
	};
}

function scalarInput(inputs: Record<string, unknown>, name: string, defaultValue: number): number {
	const value = inputs[name];
	return value === undefined || value === null ? defaultValue : Number(value);
}

function combineVec2fF32Primitive(): NodePrimitive {
	return {
		id: 'vector.combine.vec2f_f32',
		category: 'vector',
		inputs: [
			{ name: 'xy', dataType: 'vec2f' },
			{ name: 'z', dataType: 'f32', default: 0 }
		],
		outputs: [{ name: 'value', dataType: 'vec3f' }],
		params: Type.Object({}),
		wgsl: { moduleId: 'vector.combine.vec2f_f32', entry: 'combineVec2fF32' },
		metadata: {
			description: 'Append a scalar to vec2f → vec3f.',
			help: 'Combine xy + z into vec3f; unconnected z defaults to 0.',
			keywords: ['append', 'combine', 'concat', 'promote'],
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			const xy = vectorValues(ctx.inputs.xy, 2);
			const z = scalarInput(ctx.inputs, 'z', 0);
			return { value: [xy[0]!, xy[1]!, z] };
		}
	};
}

function combineVec3fF32Primitive(): NodePrimitive {
	return {
		id: 'vector.combine.vec3f_f32',
		category: 'vector',
		inputs: [
			{ name: 'xyz', dataType: 'vec3f' },
			{ name: 'w', dataType: 'f32', default: 1 }
		],
		outputs: [{ name: 'value', dataType: 'vec4f' }],
		params: Type.Object({}),
		wgsl: { moduleId: 'vector.combine.vec3f_f32', entry: 'combineVec3fF32' },
		metadata: {
			description: 'Append a scalar to vec3f → vec4f.',
			help: 'Combine xyz + w into vec4f; unconnected w defaults to 1 (opaque/homogeneous).',
			keywords: ['append', 'combine', 'concat', 'promote', 'homogeneous'],
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			const xyz = vectorValues(ctx.inputs.xyz, 3);
			const w = scalarInput(ctx.inputs, 'w', 1);
			return { value: [xyz[0]!, xyz[1]!, xyz[2]!, w] };
		}
	};
}

function combineVec2fF32F32Primitive(): NodePrimitive {
	return {
		id: 'vector.combine.vec2f_f32_f32',
		category: 'vector',
		inputs: [
			{ name: 'xy', dataType: 'vec2f' },
			{ name: 'z', dataType: 'f32', default: 0 },
			{ name: 'w', dataType: 'f32', default: 1 }
		],
		outputs: [{ name: 'value', dataType: 'vec4f' }],
		params: Type.Object({}),
		wgsl: { moduleId: 'vector.combine.vec2f_f32_f32', entry: 'combineVec2fF32F32' },
		metadata: {
			description: 'Build vec4f from vec2f + two scalars.',
			help: 'Combine xy + z + w; unconnected z defaults to 0, w to 1.',
			keywords: ['append', 'combine', 'concat', 'promote', 'homogeneous'],
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			const xy = vectorValues(ctx.inputs.xy, 2);
			const z = scalarInput(ctx.inputs, 'z', 0);
			const w = scalarInput(ctx.inputs, 'w', 1);
			return { value: [xy[0]!, xy[1]!, z, w] };
		}
	};
}

function combineVec2fVec2fPrimitive(): NodePrimitive {
	return {
		id: 'vector.combine.vec2f_vec2f',
		category: 'vector',
		inputs: [
			{ name: 'xy', dataType: 'vec2f' },
			{ name: 'zw', dataType: 'vec2f' }
		],
		outputs: [{ name: 'value', dataType: 'vec4f' }],
		params: Type.Object({}),
		wgsl: { moduleId: 'vector.combine.vec2f_vec2f', entry: 'combineVec2fVec2f' },
		metadata: {
			description: 'Concatenate two vec2f values → vec4f.',
			help: 'Combine xy and zw into vec4f (xyzw).',
			keywords: ['append', 'combine', 'concat'],
			pure: true,
			deterministic: true
		},
		evalCPU(ctx) {
			const xy = vectorValues(ctx.inputs.xy, 2);
			const zw = vectorValues(ctx.inputs.zw, 2);
			return { value: [xy[0]!, xy[1]!, zw[0]!, zw[1]!] };
		}
	};
}

function combinePrimitives(): NodePrimitive[] {
	return [
		combineVec2fF32Primitive(),
		combineVec3fF32Primitive(),
		combineVec2fF32F32Primitive(),
		combineVec2fVec2fPrimitive()
	];
}

function vectorMathPrimitives(): NodePrimitive[] {
	const primitives: NodePrimitive[] = [];
	for (const { type, size } of VECTOR_SPECS) {
		primitives.push(
			binaryVectorPrimitive('add', type, size),
			binaryVectorPrimitive('sub', type, size),
			scalarVectorPrimitive('mulScalar', type, size),
			scalarVectorPrimitive('divScalar', type, size),
			dotPrimitive(type, size),
			lengthPrimitive(type, size),
			normalizePrimitive(type, size),
			mixPrimitive(type, size)
		);
	}
	return primitives;
}

const primitives = [
	constantF32,
	vec2f,
	vec3f,
	vec4f,
	componentPrimitive('vector.vec2f.x', 'vec2f', 'x', 0),
	componentPrimitive('vector.vec2f.y', 'vec2f', 'y', 1),
	componentPrimitive('vector.vec3f.x', 'vec3f', 'x', 0),
	componentPrimitive('vector.vec3f.y', 'vec3f', 'y', 1),
	componentPrimitive('vector.vec3f.z', 'vec3f', 'z', 2),
	componentPrimitive('vector.vec4f.x', 'vec4f', 'x', 0),
	componentPrimitive('vector.vec4f.y', 'vec4f', 'y', 1),
	componentPrimitive('vector.vec4f.z', 'vec4f', 'z', 2),
	componentPrimitive('vector.vec4f.w', 'vec4f', 'w', 3),
	...combinePrimitives(),
	...vectorMathPrimitives()
];

for (const primitive of primitives) {
	registerPrimitive(primitive);
}
