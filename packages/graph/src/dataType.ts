import type { DataType, ListDataType, ValueDataType } from './types.js';

export type PortDefaultValue = number | boolean | number[];

const VALUE_TYPE_ALIASES: Record<string, ValueDataType> = {
	f32: 'f32',
	bool: 'bool',
	vec2f: 'vec2f',
	'vec2<f32>': 'vec2f',
	vec3f: 'vec3f',
	'vec3<f32>': 'vec3f',
	vec4f: 'vec4f',
	'vec4<f32>': 'vec4f'
};

const CANONICAL_RESOURCE_AND_PIPELINE: readonly DataType[] = [
	'image',
	'mesh',
	'audio',
	'geometry',
	'varyings',
	'texture',
	'vertexBuffer',
	'indexBuffer',
	'renderTarget',
	'bindGroup',
	'storageBuffer'
];

function normalizeTypeString(raw: string): string {
	return raw.replace(/\s+/g, '');
}

function formatScalar(value: number): string {
	const s = value.toString();
	return s.includes('.') || s.includes('e') ? s : `${s}.0`;
}

/** Fold every spelling of a graph data type to the canonical short alias form. */
export function canonicalDataType(raw: string): DataType {
	const normalized = normalizeTypeString(raw);

	if (normalized.startsWith('tuple<') && normalized.endsWith('>')) {
		const inner = canonicalDataType(normalized.slice(6, -1));
		return `tuple<${inner}>` as ListDataType;
	}

	const valueAlias = VALUE_TYPE_ALIASES[normalized];
	if (valueAlias) return valueAlias;

	if (CANONICAL_RESOURCE_AND_PIPELINE.includes(normalized as DataType)) {
		return normalized as DataType;
	}

	throw new Error(`Unsupported data type: ${raw.trim()}`);
}

/** Map a canonical graph data type to its WGSL spelling. */
export function dataTypeToWgsl(dataType: DataType): string {
	switch (canonicalDataType(dataType)) {
		case 'f32':
			return 'f32';
		case 'bool':
			return 'bool';
		case 'vec2f':
			return 'vec2<f32>';
		case 'vec3f':
			return 'vec3<f32>';
		case 'vec4f':
			return 'vec4<f32>';
		default:
			throw new Error(`Unsupported GPU data type: ${dataType}`);
	}
}

/** Whether `raw` is already in canonical graph form. */
export function isCanonicalDataType(raw: string): boolean {
	try {
		return canonicalDataType(raw) === raw;
	} catch {
		return false;
	}
}

/** Emit a WGSL literal for an unconnected input port default. */
export function formatPortDefaultWgsl(value: PortDefaultValue, dataType: DataType): string {
	const canonical = canonicalDataType(dataType);
	if (canonical === 'f32') {
		if (typeof value !== 'number') {
			throw new Error(`Expected numeric default for f32 port, got ${typeof value}`);
		}
		return formatScalar(value);
	}
	if (canonical === 'bool') {
		if (typeof value !== 'boolean') {
			throw new Error(`Expected boolean default for bool port, got ${typeof value}`);
		}
		return value ? 'true' : 'false';
	}
	if (canonical === 'vec2f' || canonical === 'vec3f' || canonical === 'vec4f') {
		if (!Array.isArray(value)) {
			throw new Error(`Expected array default for ${canonical} port`);
		}
		const size = canonical === 'vec2f' ? 2 : canonical === 'vec3f' ? 3 : 4;
		const components = Array.from({ length: size }, (_, index) => formatScalar(Number(value[index] ?? 0)));
		return `${dataTypeToWgsl(canonical)}(${components.join(', ')})`;
	}
	throw new Error(`Port defaults are not supported for data type: ${dataType}`);
}
