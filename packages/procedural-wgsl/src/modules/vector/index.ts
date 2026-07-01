export const CONSTANT_F32_SOURCE = `fn constantF32(value: f32) -> f32 {
	return value;
}`;

export const VECTOR_VEC2F_SOURCE = `fn makeVec2f(x: f32, y: f32) -> vec2<f32> {
	return vec2<f32>(x, y);
}`;

export const VECTOR_VEC3F_SOURCE = `fn makeVec3f(x: f32, y: f32, z: f32) -> vec3<f32> {
	return vec3<f32>(x, y, z);
}`;

export const VECTOR_VEC4F_SOURCE = `fn makeVec4f(x: f32, y: f32, z: f32, w: f32) -> vec4<f32> {
	return vec4<f32>(x, y, z, w);
}`;

function componentSource(inputType: string, component: string, entry: string): string {
	return `fn ${entry}(value: ${inputType}) -> f32 {
	return value.${component};
}`;
}

export const VECTOR_VEC2F_X_SOURCE = componentSource('vec2<f32>', 'x', 'vec2fX');
export const VECTOR_VEC2F_Y_SOURCE = componentSource('vec2<f32>', 'y', 'vec2fY');
export const VECTOR_VEC3F_X_SOURCE = componentSource('vec3<f32>', 'x', 'vec3fX');
export const VECTOR_VEC3F_Y_SOURCE = componentSource('vec3<f32>', 'y', 'vec3fY');
export const VECTOR_VEC3F_Z_SOURCE = componentSource('vec3<f32>', 'z', 'vec3fZ');
export const VECTOR_VEC4F_X_SOURCE = componentSource('vec4<f32>', 'x', 'vec4fX');
export const VECTOR_VEC4F_Y_SOURCE = componentSource('vec4<f32>', 'y', 'vec4fY');
export const VECTOR_VEC4F_Z_SOURCE = componentSource('vec4<f32>', 'z', 'vec4fZ');
export const VECTOR_VEC4F_W_SOURCE = componentSource('vec4<f32>', 'w', 'vec4fW');

export const CONSTANT_F32_MODULE = {
	id: 'constant.f32',
	source: CONSTANT_F32_SOURCE
} as const;

export const VECTOR_VEC2F_MODULE = {
	id: 'vector.vec2f',
	source: VECTOR_VEC2F_SOURCE
} as const;

export const VECTOR_VEC3F_MODULE = {
	id: 'vector.vec3f',
	source: VECTOR_VEC3F_SOURCE
} as const;

export const VECTOR_VEC4F_MODULE = {
	id: 'vector.vec4f',
	source: VECTOR_VEC4F_SOURCE
} as const;

export const VECTOR_VEC2F_X_MODULE = {
	id: 'vector.vec2f.x',
	source: VECTOR_VEC2F_X_SOURCE
} as const;

export const VECTOR_VEC2F_Y_MODULE = {
	id: 'vector.vec2f.y',
	source: VECTOR_VEC2F_Y_SOURCE
} as const;

export const VECTOR_VEC3F_X_MODULE = {
	id: 'vector.vec3f.x',
	source: VECTOR_VEC3F_X_SOURCE
} as const;

export const VECTOR_VEC3F_Y_MODULE = {
	id: 'vector.vec3f.y',
	source: VECTOR_VEC3F_Y_SOURCE
} as const;

export const VECTOR_VEC3F_Z_MODULE = {
	id: 'vector.vec3f.z',
	source: VECTOR_VEC3F_Z_SOURCE
} as const;

export const VECTOR_VEC4F_X_MODULE = {
	id: 'vector.vec4f.x',
	source: VECTOR_VEC4F_X_SOURCE
} as const;

export const VECTOR_VEC4F_Y_MODULE = {
	id: 'vector.vec4f.y',
	source: VECTOR_VEC4F_Y_SOURCE
} as const;

export const VECTOR_VEC4F_Z_MODULE = {
	id: 'vector.vec4f.z',
	source: VECTOR_VEC4F_Z_SOURCE
} as const;

export const VECTOR_VEC4F_W_MODULE = {
	id: 'vector.vec4f.w',
	source: VECTOR_VEC4F_W_SOURCE
} as const;

function binarySource(entry: string, wgslType: string, operator: '+' | '-'): string {
	return `fn ${entry}(a: ${wgslType}, b: ${wgslType}) -> ${wgslType} {
	return a ${operator} b;
}`;
}

function scalarSource(entry: string, wgslType: string, operator: '*' | '/'): string {
	return `fn ${entry}(value: ${wgslType}, scalar: f32) -> ${wgslType} {
	return value ${operator} scalar;
}`;
}

function builtinUnarySource(entry: string, wgslType: string, builtin: 'length' | 'normalize'): string {
	const outputType = builtin === 'length' ? 'f32' : wgslType;
	return `fn ${entry}(value: ${wgslType}) -> ${outputType} {
	return ${builtin}(value);
}`;
}

function dotSource(entry: string, wgslType: string): string {
	return `fn ${entry}(a: ${wgslType}, b: ${wgslType}) -> f32 {
	return dot(a, b);
}`;
}

function mixSource(entry: string, wgslType: string): string {
	return `fn ${entry}(a: ${wgslType}, b: ${wgslType}, t: f32) -> ${wgslType} {
	return mix(a, b, t);
}`;
}

function vectorModule(id: string, source: string) {
	return { id, source } as const;
}

export const VECTOR_ADD_VEC2F_SOURCE = binarySource('addVec2f', 'vec2<f32>', '+');
export const VECTOR_ADD_VEC3F_SOURCE = binarySource('addVec3f', 'vec3<f32>', '+');
export const VECTOR_ADD_VEC4F_SOURCE = binarySource('addVec4f', 'vec4<f32>', '+');
export const VECTOR_SUB_VEC2F_SOURCE = binarySource('subVec2f', 'vec2<f32>', '-');
export const VECTOR_SUB_VEC3F_SOURCE = binarySource('subVec3f', 'vec3<f32>', '-');
export const VECTOR_SUB_VEC4F_SOURCE = binarySource('subVec4f', 'vec4<f32>', '-');
export const VECTOR_MUL_SCALAR_VEC2F_SOURCE = scalarSource('mulScalarVec2f', 'vec2<f32>', '*');
export const VECTOR_MUL_SCALAR_VEC3F_SOURCE = scalarSource('mulScalarVec3f', 'vec3<f32>', '*');
export const VECTOR_MUL_SCALAR_VEC4F_SOURCE = scalarSource('mulScalarVec4f', 'vec4<f32>', '*');
export const VECTOR_DIV_SCALAR_VEC2F_SOURCE = scalarSource('divScalarVec2f', 'vec2<f32>', '/');
export const VECTOR_DIV_SCALAR_VEC3F_SOURCE = scalarSource('divScalarVec3f', 'vec3<f32>', '/');
export const VECTOR_DIV_SCALAR_VEC4F_SOURCE = scalarSource('divScalarVec4f', 'vec4<f32>', '/');
export const VECTOR_DOT_VEC2F_SOURCE = dotSource('dotVec2f', 'vec2<f32>');
export const VECTOR_DOT_VEC3F_SOURCE = dotSource('dotVec3f', 'vec3<f32>');
export const VECTOR_DOT_VEC4F_SOURCE = dotSource('dotVec4f', 'vec4<f32>');
export const VECTOR_LENGTH_VEC2F_SOURCE = builtinUnarySource('lengthVec2f', 'vec2<f32>', 'length');
export const VECTOR_LENGTH_VEC3F_SOURCE = builtinUnarySource('lengthVec3f', 'vec3<f32>', 'length');
export const VECTOR_LENGTH_VEC4F_SOURCE = builtinUnarySource('lengthVec4f', 'vec4<f32>', 'length');
export const VECTOR_NORMALIZE_VEC2F_SOURCE = builtinUnarySource(
	'normalizeVec2f',
	'vec2<f32>',
	'normalize'
);
export const VECTOR_NORMALIZE_VEC3F_SOURCE = builtinUnarySource(
	'normalizeVec3f',
	'vec3<f32>',
	'normalize'
);
export const VECTOR_NORMALIZE_VEC4F_SOURCE = builtinUnarySource(
	'normalizeVec4f',
	'vec4<f32>',
	'normalize'
);
export const VECTOR_MIX_VEC2F_SOURCE = mixSource('mixVec2f', 'vec2<f32>');
export const VECTOR_MIX_VEC3F_SOURCE = mixSource('mixVec3f', 'vec3<f32>');
export const VECTOR_MIX_VEC4F_SOURCE = mixSource('mixVec4f', 'vec4<f32>');

export const VECTOR_ADD_VEC2F_MODULE = vectorModule('vector.add.vec2f', VECTOR_ADD_VEC2F_SOURCE);
export const VECTOR_ADD_VEC3F_MODULE = vectorModule('vector.add.vec3f', VECTOR_ADD_VEC3F_SOURCE);
export const VECTOR_ADD_VEC4F_MODULE = vectorModule('vector.add.vec4f', VECTOR_ADD_VEC4F_SOURCE);
export const VECTOR_SUB_VEC2F_MODULE = vectorModule('vector.sub.vec2f', VECTOR_SUB_VEC2F_SOURCE);
export const VECTOR_SUB_VEC3F_MODULE = vectorModule('vector.sub.vec3f', VECTOR_SUB_VEC3F_SOURCE);
export const VECTOR_SUB_VEC4F_MODULE = vectorModule('vector.sub.vec4f', VECTOR_SUB_VEC4F_SOURCE);
export const VECTOR_MUL_SCALAR_VEC2F_MODULE = vectorModule(
	'vector.mulScalar.vec2f',
	VECTOR_MUL_SCALAR_VEC2F_SOURCE
);
export const VECTOR_MUL_SCALAR_VEC3F_MODULE = vectorModule(
	'vector.mulScalar.vec3f',
	VECTOR_MUL_SCALAR_VEC3F_SOURCE
);
export const VECTOR_MUL_SCALAR_VEC4F_MODULE = vectorModule(
	'vector.mulScalar.vec4f',
	VECTOR_MUL_SCALAR_VEC4F_SOURCE
);
export const VECTOR_DIV_SCALAR_VEC2F_MODULE = vectorModule(
	'vector.divScalar.vec2f',
	VECTOR_DIV_SCALAR_VEC2F_SOURCE
);
export const VECTOR_DIV_SCALAR_VEC3F_MODULE = vectorModule(
	'vector.divScalar.vec3f',
	VECTOR_DIV_SCALAR_VEC3F_SOURCE
);
export const VECTOR_DIV_SCALAR_VEC4F_MODULE = vectorModule(
	'vector.divScalar.vec4f',
	VECTOR_DIV_SCALAR_VEC4F_SOURCE
);
export const VECTOR_DOT_VEC2F_MODULE = vectorModule('vector.dot.vec2f', VECTOR_DOT_VEC2F_SOURCE);
export const VECTOR_DOT_VEC3F_MODULE = vectorModule('vector.dot.vec3f', VECTOR_DOT_VEC3F_SOURCE);
export const VECTOR_DOT_VEC4F_MODULE = vectorModule('vector.dot.vec4f', VECTOR_DOT_VEC4F_SOURCE);
export const VECTOR_LENGTH_VEC2F_MODULE = vectorModule(
	'vector.length.vec2f',
	VECTOR_LENGTH_VEC2F_SOURCE
);
export const VECTOR_LENGTH_VEC3F_MODULE = vectorModule(
	'vector.length.vec3f',
	VECTOR_LENGTH_VEC3F_SOURCE
);
export const VECTOR_LENGTH_VEC4F_MODULE = vectorModule(
	'vector.length.vec4f',
	VECTOR_LENGTH_VEC4F_SOURCE
);
export const VECTOR_NORMALIZE_VEC2F_MODULE = vectorModule(
	'vector.normalize.vec2f',
	VECTOR_NORMALIZE_VEC2F_SOURCE
);
export const VECTOR_NORMALIZE_VEC3F_MODULE = vectorModule(
	'vector.normalize.vec3f',
	VECTOR_NORMALIZE_VEC3F_SOURCE
);
export const VECTOR_NORMALIZE_VEC4F_MODULE = vectorModule(
	'vector.normalize.vec4f',
	VECTOR_NORMALIZE_VEC4F_SOURCE
);
export const VECTOR_MIX_VEC2F_MODULE = vectorModule('vector.mix.vec2f', VECTOR_MIX_VEC2F_SOURCE);
export const VECTOR_MIX_VEC3F_MODULE = vectorModule('vector.mix.vec3f', VECTOR_MIX_VEC3F_SOURCE);
export const VECTOR_MIX_VEC4F_MODULE = vectorModule('vector.mix.vec4f', VECTOR_MIX_VEC4F_SOURCE);

export const VECTOR_COMBINE_VEC2F_F32_SOURCE = `fn combineVec2fF32(xy: vec2<f32>, z: f32) -> vec3<f32> {
	return vec3<f32>(xy, z);
}`;

export const VECTOR_COMBINE_VEC3F_F32_SOURCE = `fn combineVec3fF32(xyz: vec3<f32>, w: f32) -> vec4<f32> {
	return vec4<f32>(xyz, w);
}`;

export const VECTOR_COMBINE_VEC2F_F32_F32_SOURCE = `fn combineVec2fF32F32(xy: vec2<f32>, z: f32, w: f32) -> vec4<f32> {
	return vec4<f32>(xy, z, w);
}`;

export const VECTOR_COMBINE_VEC2F_VEC2F_SOURCE = `fn combineVec2fVec2f(xy: vec2<f32>, zw: vec2<f32>) -> vec4<f32> {
	return vec4<f32>(xy, zw);
}`;

export const VECTOR_COMBINE_VEC2F_F32_MODULE = vectorModule(
	'vector.combine.vec2f_f32',
	VECTOR_COMBINE_VEC2F_F32_SOURCE
);
export const VECTOR_COMBINE_VEC3F_F32_MODULE = vectorModule(
	'vector.combine.vec3f_f32',
	VECTOR_COMBINE_VEC3F_F32_SOURCE
);
export const VECTOR_COMBINE_VEC2F_F32_F32_MODULE = vectorModule(
	'vector.combine.vec2f_f32_f32',
	VECTOR_COMBINE_VEC2F_F32_F32_SOURCE
);
export const VECTOR_COMBINE_VEC2F_VEC2F_MODULE = vectorModule(
	'vector.combine.vec2f_vec2f',
	VECTOR_COMBINE_VEC2F_VEC2F_SOURCE
);

export const VECTOR_COMBINE_MODULES = [
	VECTOR_COMBINE_VEC2F_F32_MODULE,
	VECTOR_COMBINE_VEC3F_F32_MODULE,
	VECTOR_COMBINE_VEC2F_F32_F32_MODULE,
	VECTOR_COMBINE_VEC2F_VEC2F_MODULE
] as const;

export const VECTOR_MATH_MODULES = [
	VECTOR_ADD_VEC2F_MODULE,
	VECTOR_ADD_VEC3F_MODULE,
	VECTOR_ADD_VEC4F_MODULE,
	VECTOR_SUB_VEC2F_MODULE,
	VECTOR_SUB_VEC3F_MODULE,
	VECTOR_SUB_VEC4F_MODULE,
	VECTOR_MUL_SCALAR_VEC2F_MODULE,
	VECTOR_MUL_SCALAR_VEC3F_MODULE,
	VECTOR_MUL_SCALAR_VEC4F_MODULE,
	VECTOR_DIV_SCALAR_VEC2F_MODULE,
	VECTOR_DIV_SCALAR_VEC3F_MODULE,
	VECTOR_DIV_SCALAR_VEC4F_MODULE,
	VECTOR_DOT_VEC2F_MODULE,
	VECTOR_DOT_VEC3F_MODULE,
	VECTOR_DOT_VEC4F_MODULE,
	VECTOR_LENGTH_VEC2F_MODULE,
	VECTOR_LENGTH_VEC3F_MODULE,
	VECTOR_LENGTH_VEC4F_MODULE,
	VECTOR_NORMALIZE_VEC2F_MODULE,
	VECTOR_NORMALIZE_VEC3F_MODULE,
	VECTOR_NORMALIZE_VEC4F_MODULE,
	VECTOR_MIX_VEC2F_MODULE,
	VECTOR_MIX_VEC3F_MODULE,
	VECTOR_MIX_VEC4F_MODULE
] as const;
