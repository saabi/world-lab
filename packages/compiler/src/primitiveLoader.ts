import { parse as parseYaml } from 'yaml';

import {
	Type,
	X_EXTENT,
	X_SCALE_BEHAVIOR,
	X_SECTION,
	X_SECTIONS,
	X_UNIT,
	X_WIDGET,
	type ParamSectionMeta,
	type ScaleBehavior,
	type TSchema,
	type Unit,
} from '@world-lab/schema';
import type {
	DataType,
	NodePrimitive,
	PortMetadata,
	PortSpec,
	PrimitiveMetadata,
	SemanticTag,
	SpaceId,
	WgslArgumentBinding,
} from '@world-lab/graph';
import { canonicalDataType, dedupeCanonicalSemantics } from '@world-lab/graph';

export interface WgslFnParameter {
	name: string;
	type: string;
}

export interface WgslFnSignature {
	name: string;
	parameters: WgslFnParameter[];
	returnType: string;
}

export interface WgslSignatureReader {
	readSignatures(source: string): WgslFnSignature[];
	readImports(source: string): string[];
}

export interface LoadWgslPrimitiveInput {
	moduleId: string;
	source: string;
	reader?: WgslSignatureReader;
}

export interface LoadedWgslPrimitive {
	primitive: NodePrimitive;
	imports: string[];
}

const MODULE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const TOP_LEVEL_KEYS = new Set([
	'id',
	'entry',
	'category',
	'description',
	'pure',
	'deterministic',
	'color',
	'icon',
	'keywords',
	'role',
	'help',
	'usage',
	'sections',
	'inputs',
	'params',
	'outputs',
]);

const PORT_FIELD_KEYS = new Set([
	'description',
	'semantic',
	'semantics',
	'space',
	'unit',
	'range',
]);

const PARAM_FIELD_KEYS = new Set([
	'description',
	'unit',
	'widget',
	'min',
	'max',
	'default',
	'section',
	'scaleBehavior',
]);

const UNITS = new Set<Unit>(['none', 'm', 'km', 'kg', 's', 'rad', 'deg', '1/m']);
const SCALE_BEHAVIORS = new Set<ScaleBehavior>([
	'freq',
	'ratioR',
	'R_ref',
	'pure',
	'flag',
	'length',
]);

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertPlainTree(value: unknown, path = 'frontmatter'): void {
	if (
		value === null ||
		typeof value === 'string' ||
		typeof value === 'number' ||
		typeof value === 'boolean'
	) {
		return;
	}
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			assertPlainTree(value[i], `${path}[${i}]`);
		}
		return;
	}
	if (isPlainObject(value)) {
		for (const [key, child] of Object.entries(value)) {
			assertPlainTree(child, `${path}.${key}`);
		}
		return;
	}
	throw new Error(`Invalid frontmatter value at ${path}`);
}

function normalizeWgslType(type: string): string {
	return type.replace(/\s+/g, '');
}

function wgslTypeToDataType(type: string): DataType {
	return canonicalDataType(type.trim());
}

function findBlockCommentEnd(source: string, start: number): number {
	let depth = 1;
	let i = start;
	while (i < source.length) {
		if (source.startsWith('/*', i)) {
			depth++;
			i += 2;
			continue;
		}
		if (source.startsWith('*/', i)) {
			depth--;
			if (depth === 0) {
				return i;
			}
			i += 2;
			continue;
		}
		i++;
	}
	return -1;
}

function stripComments(source: string): string {
	let out = '';
	let i = 0;
	while (i < source.length) {
		if (source.startsWith('//', i)) {
			const newline = source.indexOf('\n', i);
			if (newline === -1) {
				break;
			}
			out += '\n';
			i = newline + 1;
			continue;
		}
		if (source.startsWith('/*', i)) {
			const end = findBlockCommentEnd(source, i + 2);
			if (end === -1) {
				throw new Error('Unterminated block comment');
			}
			out += ' ';
			i = end + 2;
			continue;
		}
		out += source[i];
		i++;
	}
	return out;
}

function skipWs(source: string, pos: number): number {
	while (pos < source.length && /\s/.test(source[pos]!)) {
		pos++;
	}
	return pos;
}

function readIdentifier(source: string, pos: number): { value: string; next: number } | null {
	pos = skipWs(source, pos);
	const match = source.slice(pos).match(/^([A-Za-z_][A-Za-z0-9_]*)/);
	if (!match) {
		return null;
	}
	return { value: match[1]!, next: pos + match[1]!.length };
}

function splitTopLevelComma(source: string): string[] {
	const parts: string[] = [];
	let depthParen = 0;
	let depthAngle = 0;
	let start = 0;
	for (let i = 0; i < source.length; i++) {
		const ch = source[i]!;
		if (ch === '(') {
			depthParen++;
		} else if (ch === ')') {
			depthParen--;
		} else if (ch === '<') {
			depthAngle++;
		} else if (ch === '>') {
			depthAngle--;
		} else if (ch === ',' && depthParen === 0 && depthAngle === 0) {
			parts.push(source.slice(start, i).trim());
			start = i + 1;
		}
	}
	parts.push(source.slice(start).trim());
	return parts.filter((part) => part.length > 0);
}

function readType(source: string, pos: number): { value: string; next: number } {
	pos = skipWs(source, pos);
	let depthAngle = 0;
	let start = pos;
	while (pos < source.length) {
		const ch = source[pos]!;
		if (ch === '<') {
			depthAngle++;
		} else if (ch === '>') {
			depthAngle--;
		} else if (depthAngle === 0 && (ch === ',' || ch === ')' || ch === '{')) {
			break;
		}
		pos++;
	}
	const value = source.slice(start, pos).trim();
	if (!value) {
		throw new Error('Missing parameter or return type');
	}
	return { value, next: pos };
}

function parseFunctionAt(source: string, start: number): { signature: WgslFnSignature; next: number } {
	let pos = start;
	if (!source.startsWith('fn', pos)) {
		throw new Error('Expected function declaration');
	}
	pos += 2;
	const name = readIdentifier(source, pos);
	if (!name) {
		throw new Error('Missing function name');
	}
	pos = skipWs(source, name.next);
	if (source[pos] !== '(') {
		throw new Error('Expected "(" after function name');
	}
	pos++;
	const closeParen = findMatchingParen(source, pos);
	const paramSource = source.slice(pos, closeParen);
	const parameters: WgslFnParameter[] = [];
	for (const part of splitTopLevelComma(paramSource)) {
		const colon = part.indexOf(':');
		if (colon === -1) {
			throw new Error('Missing parameter type');
		}
		const paramName = part.slice(0, colon).trim();
		const paramType = part.slice(colon + 1).trim();
		if (!IDENT_RE.test(paramName) || !paramType) {
			throw new Error('Invalid parameter declaration');
		}
		parameters.push({ name: paramName, type: paramType });
	}
	pos = closeParen + 1;
	pos = skipWs(source, pos);
	if (!source.startsWith('->', pos)) {
		throw new Error('Missing function return type');
	}
	pos += 2;
	const returnType = readType(source, pos);
	pos = skipWs(source, returnType.next);
	if (source[pos] !== '{') {
		throw new Error('Expected function body');
	}
	return {
		signature: {
			name: name.value,
			parameters,
			returnType: returnType.value,
		},
		next: pos + 1,
	};
}

function findMatchingParen(source: string, start: number): number {
	let depth = 1;
	let i = start;
	while (i < source.length) {
		const ch = source[i]!;
		if (ch === '(') {
			depth++;
		} else if (ch === ')') {
			depth--;
			if (depth === 0) {
				return i;
			}
		}
		i++;
	}
	throw new Error('Unbalanced parentheses in function parameters');
}

function readSignaturesFromSource(source: string): WgslFnSignature[] {
	const cleaned = stripComments(source);
	const signatures: WgslFnSignature[] = [];
	const seen = new Set<string>();
	let pos = 0;
	while (pos < cleaned.length) {
		const fnIndex = cleaned.indexOf('fn', pos);
		if (fnIndex === -1) {
			break;
		}
		const before = fnIndex === 0 ? '' : cleaned[fnIndex - 1];
		const after = cleaned[fnIndex + 2] ?? ' ';
		if ((before && /[A-Za-z0-9_]/.test(before)) || /[A-Za-z0-9_]/.test(after)) {
			pos = fnIndex + 2;
			continue;
		}
		const parsed = parseFunctionAt(cleaned, fnIndex);
		if (seen.has(parsed.signature.name)) {
			throw new Error(`Duplicate function name: ${parsed.signature.name}`);
		}
		seen.add(parsed.signature.name);
		signatures.push(parsed.signature);
		pos = parsed.next;
	}
	return signatures;
}

function readImportsFromSource(source: string): string[] {
	const imports: string[] = [];
	const seen = new Set<string>();
	let inBlock = false;
	let i = 0;
	while (i < source.length) {
		if (!inBlock && source.startsWith('//', i)) {
			const lineEnd = source.indexOf('\n', i);
			const line = source.slice(i, lineEnd === -1 ? source.length : lineEnd);
			const useMatch = line.match(/^\s*\/\/\s*@use(?:\s+(.+))?$/);
			if (useMatch) {
				const raw = (useMatch[1] ?? '').trim();
				if (!raw) {
					throw new Error('Invalid @use directive');
				}
				if (!MODULE_ID_RE.test(raw)) {
					throw new Error(`Invalid @use module id: ${raw}`);
				}
				if (!seen.has(raw)) {
					seen.add(raw);
					imports.push(raw);
				}
			}
			i = lineEnd === -1 ? source.length : lineEnd + 1;
			continue;
		}
		if (source.startsWith('/*', i)) {
			const end = findBlockCommentEnd(source, i + 2);
			if (end === -1) {
				throw new Error('Unterminated block comment');
			}
			inBlock = true;
			i = end + 2;
			inBlock = false;
			continue;
		}
		i++;
	}
	return imports;
}

export const textWgslSignatureReader: WgslSignatureReader = {
	readSignatures: readSignaturesFromSource,
	readImports: readImportsFromSource,
};

const FRONTMATTER_RE = /^\s*\/\*---\n([\s\S]*?)\n---\*\//;

function parseFrontmatter(source: string): Record<string, unknown> {
	const match = source.match(FRONTMATTER_RE);
	if (!match) {
		throw new Error('Missing YAML frontmatter block');
	}
	const extra = source.slice(match[0].length).match(/^\s*\/\*---[\s\S]*?---\*\//);
	if (extra) {
		throw new Error('Multiple YAML frontmatter blocks');
	}
	const decoded = parseYaml(match[1]!, { maxAliasCount: 0 });
	if (!isPlainObject(decoded)) {
		throw new Error('Frontmatter must be a mapping');
	}
	assertPlainTree(decoded);
	return decoded;
}

function requireString(value: unknown, label: string): string {
	if (typeof value !== 'string' || value.length === 0) {
		throw new Error(`Invalid ${label}`);
	}
	return value;
}

function parsePortMetadata(
	raw: unknown,
	label: string,
): { metadata: PortMetadata; space?: SpaceId; semantics?: SemanticTag[] } {
	if (raw === null || raw === undefined) raw = {};
	if (!isPlainObject(raw)) throw new Error(`Invalid ${label}`);

	const metadata: PortMetadata = {};
	let space: SpaceId | undefined;
	let semantics: SemanticTag[] | undefined;
	for (const [key, value] of Object.entries(raw)) {
		if (!PORT_FIELD_KEYS.has(key)) throw new Error(`Unknown port field key: ${key}`);
		if (key === 'space') {
			if (typeof value !== 'string' || value.length === 0) {
				throw new Error(`Invalid coordinate space: ${String(value)}`);
			}
			space = value;
		} else if (key === 'semantics') {
			if (!Array.isArray(value) || value.some((tag) => typeof tag !== 'string')) {
				throw new Error(`Invalid ${label}.semantics`);
			}
			semantics = dedupeCanonicalSemantics(value as SemanticTag[]);
		} else if (key === 'description' || key === 'semantic' || key === 'unit') {
			if (typeof value !== 'string') throw new Error(`Invalid ${label}.${key}`);
			metadata[key] = value;
		} else if (key === 'range') {
			if (
				!Array.isArray(value) ||
				value.length !== 2 ||
				typeof value[0] !== 'number' ||
				typeof value[1] !== 'number'
			) {
				throw new Error(`Invalid ${label}.range`);
			}
			metadata.range = [value[0], value[1]];
		}
	}
	return { metadata, space, semantics };
}

function omitEmptyMetadata<T extends PortMetadata | PrimitiveMetadata>(metadata: T): T | undefined {
	const entries = Object.entries(metadata).filter(([, value]) => value !== undefined);
	if (entries.length === 0) {
		return undefined;
	}
	return Object.fromEntries(entries) as T;
}

function parsePrimitiveMetadata(doc: Record<string, unknown>): PrimitiveMetadata | undefined {
	const metadata: PrimitiveMetadata = {};
	if (doc.description !== undefined) {
		if (typeof doc.description !== 'string') {
			throw new Error('Invalid description');
		}
		metadata.description = doc.description;
	}
	if (doc.pure !== undefined) {
		if (typeof doc.pure !== 'boolean') {
			throw new Error('Invalid pure');
		}
		metadata.pure = doc.pure;
	}
	if (doc.deterministic !== undefined) {
		if (typeof doc.deterministic !== 'boolean') {
			throw new Error('Invalid deterministic');
		}
		metadata.deterministic = doc.deterministic;
	}
	if (doc.color !== undefined) {
		if (typeof doc.color !== 'string') {
			throw new Error('Invalid color');
		}
		metadata.color = doc.color;
	}
	if (doc.icon !== undefined) {
		if (typeof doc.icon !== 'string') {
			throw new Error('Invalid icon');
		}
		metadata.icon = doc.icon;
	}
	if (doc.keywords !== undefined) {
		if (!Array.isArray(doc.keywords) || doc.keywords.some((item) => typeof item !== 'string')) {
			throw new Error('Invalid keywords');
		}
		metadata.keywords = [...doc.keywords];
	}
	if (doc.role !== undefined) {
		if (typeof doc.role !== 'string') {
			throw new Error('Invalid role');
		}
		metadata.role = doc.role;
	}
	if (doc.help !== undefined) {
		if (typeof doc.help !== 'string') {
			throw new Error('Invalid help');
		}
		metadata.help = doc.help;
	}
	if (doc.usage !== undefined) {
		if (typeof doc.usage !== 'string') {
			throw new Error('Invalid usage');
		}
		metadata.usage = doc.usage;
	}
	return omitEmptyMetadata(metadata);
}

function parseSections(raw: unknown): ParamSectionMeta[] {
	if (raw === undefined) return [];
	if (!Array.isArray(raw)) throw new Error('Invalid sections');

	const sections = raw.map((section, index): ParamSectionMeta => {
		if (!isPlainObject(section)) throw new Error(`Invalid sections[${index}]`);
		for (const key of Object.keys(section)) {
			if (!['id', 'label', 'order', 'collapsed', 'parent'].includes(key)) {
				throw new Error(`Unknown section key: ${key}`);
			}
		}
		const parsed: ParamSectionMeta = {
			id: requireString(section.id, `sections[${index}].id`),
		};
		if (section.label !== undefined) {
			parsed.label = requireString(section.label, `sections[${index}].label`);
		}
		if (section.order !== undefined) {
			if (typeof section.order !== 'number') throw new Error(`Invalid sections[${index}].order`);
			parsed.order = section.order;
		}
		if (section.collapsed !== undefined) {
			if (typeof section.collapsed !== 'boolean') {
				throw new Error(`Invalid sections[${index}].collapsed`);
			}
			parsed.collapsed = section.collapsed;
		}
		if (section.parent !== undefined) {
			parsed.parent = requireString(section.parent, `sections[${index}].parent`);
		}
		return parsed;
	});

	const ids = new Set<string>();
	for (const section of sections) {
		if (ids.has(section.id)) throw new Error(`Duplicate section id: ${section.id}`);
		ids.add(section.id);
	}
	for (const section of sections) {
		if (section.parent && (!ids.has(section.parent) || section.parent === section.id)) {
			throw new Error(`Unknown section parent: ${section.parent}`);
		}
	}
	return sections;
}

function parseParamSchema(
	raw: unknown,
	label: string,
	wgslType: string,
	sectionIds: ReadonlySet<string>,
): TSchema {
	if (!isPlainObject(raw)) throw new Error(`Invalid ${label}`);
	for (const key of Object.keys(raw)) {
		if (!PARAM_FIELD_KEYS.has(key)) throw new Error(`Unknown param field key: ${key}`);
	}
	if (!('default' in raw)) throw new Error(`Missing ${label}.default`);

	const options: Record<string, unknown> = {};
	if (raw.description !== undefined) {
		if (typeof raw.description !== 'string') throw new Error(`Invalid ${label}.description`);
		options.description = raw.description;
	}
	if (raw.unit !== undefined) {
		if (typeof raw.unit !== 'string' || !UNITS.has(raw.unit as Unit)) {
			throw new Error(`Invalid ${label}.unit`);
		}
		options[X_UNIT] = raw.unit;
	}
	if (raw.widget !== undefined) {
		if (typeof raw.widget !== 'string') throw new Error(`Invalid ${label}.widget`);
		options[X_WIDGET] = raw.widget;
	}
	if (raw.section !== undefined) {
		if (typeof raw.section !== 'string' || !sectionIds.has(raw.section)) {
			throw new Error(`Unknown section reference: ${String(raw.section)}`);
		}
		options[X_SECTION] = raw.section;
	}
	if (raw.scaleBehavior !== undefined) {
		if (
			typeof raw.scaleBehavior !== 'string' ||
			!SCALE_BEHAVIORS.has(raw.scaleBehavior as ScaleBehavior)
		) {
			throw new Error(`Invalid ${label}.scaleBehavior`);
		}
		options[X_SCALE_BEHAVIOR] = raw.scaleBehavior;
	}

	const normalized = normalizeWgslType(wgslType);
	if (normalized === 'bool') {
		if (typeof raw.default !== 'boolean' || raw.min !== undefined || raw.max !== undefined) {
			throw new Error(`Invalid ${label}.default`);
		}
		options.default = raw.default;
		return Type.Boolean(options);
	}
	if (normalized !== 'f32' && normalized !== 'i32') {
		throw new Error(`Unsupported WGSL param type: ${wgslType.trim()}`);
	}
	if (typeof raw.default !== 'number') throw new Error(`Invalid ${label}.default`);
	if (raw.min !== undefined && typeof raw.min !== 'number') throw new Error(`Invalid ${label}.min`);
	if (raw.max !== undefined && typeof raw.max !== 'number') throw new Error(`Invalid ${label}.max`);
	options.default = raw.default;
	if (raw.min !== undefined) options.minimum = raw.min;
	if (raw.max !== undefined) options.maximum = raw.max;
	if (raw.min !== undefined || raw.max !== undefined) {
		options[X_EXTENT] = [raw.min ?? null, raw.max ?? null];
	}
	return normalized === 'i32' ? Type.Integer(options) : Type.Number(options);
}

export function loadWgslPrimitive(input: LoadWgslPrimitiveInput): LoadedWgslPrimitive {
	const reader = input.reader ?? textWgslSignatureReader;
	const doc = parseFrontmatter(input.source);
	for (const key of Object.keys(doc)) {
		if (!TOP_LEVEL_KEYS.has(key)) {
			throw new Error(`Unknown frontmatter key: ${key}`);
		}
	}

	const id = requireString(doc.id, 'id');
	const category = requireString(doc.category, 'category');
	if (!isPlainObject(doc.outputs)) {
		throw new Error('Invalid outputs');
	}
	const outputNames = Object.keys(doc.outputs);
	if (outputNames.length !== 1) {
		throw new Error('outputs must contain exactly one entry');
	}
	const outputName = outputNames[0]!;
	const rawOutput = doc.outputs[outputName];
	const outputField = parsePortMetadata(rawOutput, `outputs.${outputName}`);

	const signatures = reader.readSignatures(input.source);
	if (signatures.length === 0) {
		throw new Error('No function signatures found');
	}

	let entryName: string | undefined;
	if (doc.entry !== undefined) {
		entryName = requireString(doc.entry, 'entry');
	} else if (signatures.length === 1) {
		entryName = signatures[0]!.name;
	} else {
		throw new Error('entry is required when multiple functions are present');
	}

	const signature = signatures.find((candidate) => candidate.name === entryName);
	if (!signature) {
		throw new Error(`Unknown entry function: ${entryName}`);
	}

	if (doc.inputs !== undefined && !isPlainObject(doc.inputs)) throw new Error('Invalid inputs');
	if (doc.params !== undefined && !isPlainObject(doc.params)) throw new Error('Invalid params');
	const inputDoc = (doc.inputs ?? {}) as Record<string, unknown>;
	const paramDoc = (doc.params ?? {}) as Record<string, unknown>;
	const signatureNames = new Set(signature.parameters.map((parameter) => parameter.name));
	for (const key of Object.keys(inputDoc)) {
		if (!signatureNames.has(key)) throw new Error(`Unknown input annotation: ${key}`);
	}
	for (const key of Object.keys(paramDoc)) {
		if (!signatureNames.has(key)) throw new Error(`Unknown param annotation: ${key}`);
	}

	const sections = parseSections(doc.sections);
	const sectionIds = new Set(sections.map((section) => section.id));
	const inputs: PortSpec[] = [];
	const paramProperties: Record<string, TSchema> = {};
	const arguments_: WgslArgumentBinding[] = [];
	for (const parameter of signature.parameters) {
		const hasInput = Object.hasOwn(inputDoc, parameter.name);
		const hasParam = Object.hasOwn(paramDoc, parameter.name);
		if (hasInput === hasParam) {
			throw new Error(
				`WGSL argument must be classified exactly once: ${parameter.name}`,
			);
		}
		if (hasInput) {
			const { metadata, semantics, space } = parsePortMetadata(
				inputDoc[parameter.name],
				`inputs.${parameter.name}`
			);
			inputs.push({
				name: parameter.name,
				dataType: wgslTypeToDataType(parameter.type),
				...(space ? { space } : {}),
				...(semantics !== undefined ? { semantics } : {}),
				metadata: {
					...metadata,
					wgslType: parameter.type.trim(),
				},
			});
			arguments_.push({ name: parameter.name, source: 'input' });
		} else {
			paramProperties[parameter.name] = parseParamSchema(
				paramDoc[parameter.name],
				`params.${parameter.name}`,
				parameter.type,
				sectionIds,
			);
			arguments_.push({ name: parameter.name, source: 'param' });
		}
	}

	const outputMetadata = omitEmptyMetadata({
		...outputField.metadata,
		wgslType: signature.returnType.trim(),
	});
	const outputs: PortSpec[] = [
		{
			name: outputName,
			dataType: wgslTypeToDataType(signature.returnType),
			...(outputField.space ? { space: outputField.space } : {}),
			...(outputField.semantics !== undefined ? { semantics: outputField.semantics } : {}),
			...(outputMetadata ? { metadata: outputMetadata } : {}),
		},
	];

	const metadata = parsePrimitiveMetadata(doc);
	const params = Type.Object(
		paramProperties,
		sections.length > 0 ? { [X_SECTIONS]: sections } : {},
	);

	const primitive: NodePrimitive = {
		id,
		category,
		inputs,
		outputs,
		params,
		implementation: {
			kind: 'wgsl-function',
			moduleId: input.moduleId,
			entry: signature.name
		},
		wgsl: {
			moduleId: input.moduleId,
			entry: signature.name,
			arguments: arguments_,
		},
		...(metadata ? { metadata } : {}),
	};

	return {
		primitive,
		imports: reader.readImports(input.source),
	};
}
