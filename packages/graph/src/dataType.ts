import { Type, type TSchema } from '@world-lab/schema';
import type { DataType, ListDataType, TypeRef, ValueDataType } from './types.js';

export type PortDefaultValue = number | boolean | number[];

export interface PortTypeLike {
	type?: TypeRef;
	dataType?: DataType;
}

export function dataTypeToTypeRef(dataType: DataType): TypeRef {
	switch (dataType) {
		case 'f32':
			return { kind: 'scalar', scalar: 'f32' };
		case 'bool':
			return { kind: 'scalar', scalar: 'bool' };
		case 'vec2f':
			return { kind: 'vector', element: 'f32', width: 2 };
		case 'vec3f':
			return { kind: 'vector', element: 'f32', width: 3 };
		case 'vec4f':
			return { kind: 'vector', element: 'f32', width: 4 };
		case 'image':
		case 'mesh':
		case 'audio':
		case 'geometry':
		case 'varyings':
		case 'texture':
		case 'vertexBuffer':
		case 'indexBuffer':
		case 'renderTarget':
		case 'bindGroup':
		case 'storageBuffer':
		case 'tuple<f32>':
		case 'tuple<vec2f>':
		case 'tuple<vec3f>':
		case 'tuple<vec4f>':
			return { kind: 'legacy', alias: dataType };
		default: {
			const _exhaustive: never = dataType;
			return _exhaustive;
		}
	}
}

export function typeRefToDataType(type: TypeRef): DataType | undefined {
	if (type.kind === 'legacy') return type.alias;
	if (type.kind === 'scalar') {
		if (type.scalar === 'f32') return 'f32';
		if (type.scalar === 'bool') return 'bool';
		return undefined;
	}
	if (type.kind === 'vector' && type.element === 'f32') {
		if (type.width === 2) return 'vec2f';
		if (type.width === 3) return 'vec3f';
		if (type.width === 4) return 'vec4f';
	}
	return undefined;
}

export function resolvePortType(port: PortTypeLike): TypeRef {
	if (port.type) return port.type;
	if (port.dataType) return dataTypeToTypeRef(port.dataType);
	throw new Error('Port has neither type nor dataType');
}

export function resolvePortDataType(port: PortTypeLike): DataType | undefined {
	return port.dataType ?? (port.type ? typeRefToDataType(port.type) : undefined);
}

export function describeTypeRef(type: TypeRef): string {
	const alias = typeRefToDataType(type);
	if (alias) return alias;
	switch (type.kind) {
		case 'scalar':
		case 'vector':
		case 'matrix':
			return typeRefToWgsl(type);
		case 'array':
			return `array<${describeTypeRef(type.element)}${type.length === undefined ? '' : `, ${type.length}`}>`;
		case 'struct':
			return type.id;
		case 'buffer':
			return `buffer<${describeTypeRef(type.element)}, ${type.access}>`;
		case 'texture':
			return `texture_${type.dimension}<${type.sample}>`;
		case 'sampler':
			return type.comparison ? 'sampler_comparison' : 'sampler';
		case 'mesh':
			return `mesh<${describeTypeRef(type.vertex)}>`;
		case 'command':
			return `command<${type.command}>`;
		case 'legacy':
			return type.alias;
	}
}

export function describePortType(port: PortTypeLike): string {
	return port.dataType ?? describeTypeRef(resolvePortType(port));
}

export function typeRefToWgsl(type: TypeRef): string {
	switch (type.kind) {
		case 'scalar':
			return type.scalar;
		case 'vector':
			return `vec${type.width}<${type.element}>`;
		case 'matrix':
			return `mat${type.columns}x${type.rows}<${type.element}>`;
		case 'legacy':
			throw new Error(`Unsupported GPU data type: ${type.alias}`);
	}
	throw new Error(`Unsupported WGSL type kind: ${type.kind}`);
}

export function typeRefToTypeBoxSchema(type: TypeRef): TSchema | undefined {
	switch (type.kind) {
		case 'scalar':
			if (type.scalar === 'bool') return Type.Boolean();
			if (type.scalar === 'i32' || type.scalar === 'u32') return Type.Integer();
			return Type.Number();
		case 'vector':
			return Type.Tuple(
				Array.from({ length: type.width }, () =>
					type.element === 'bool'
						? Type.Boolean()
						: type.element === 'i32' || type.element === 'u32'
							? Type.Integer()
							: Type.Number()
				)
			);
		case 'struct':
			{
				const properties: Record<string, TSchema> = {};
				for (const field of type.fields) {
					const schema = typeRefToTypeBoxSchema(field.type);
					if (!schema) return undefined;
					properties[field.name] = schema;
				}
				return Type.Object(properties);
			}
		default:
			return undefined;
	}
}

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
	const type = dataTypeToTypeRef(canonicalDataType(dataType));
	if (type.kind === 'legacy') throw new Error(`Unsupported GPU data type: ${dataType}`);
	return typeRefToWgsl(type);
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
