import { getPrimitive, type NodePrimitive } from '@virtual-planet/graph';
import { Value } from '@virtual-planet/schema';
import { STANDARD_LIBRARY_MODULES } from '@virtual-planet/procedural-wgsl';

import {
	hydrateUserPrimitives,
	isUserPrimitiveId,
	listUserPrimitiveSources,
	persistUserPrimitiveSource,
	registerUserPrimitiveFromSource
} from './userPrimitives.js';

const STUB_MARKER = 'return 0.0;';

/** Honest notice for pipeline nodes with no standalone WGSL module. */
export const STRUCTURAL_NODE_NOTICE = '(no WGSL — structural node)';

const STRUCTURAL_PIPELINE_ROLES = new Set([
	'pipelineGeometrySource',
	'pipelineBuffer',
	'pipelineStage',
	'pipelineTarget'
]);

const sourceOverrides = new Map<string, string>();

function ensureReady(): void {
	hydrateUserPrimitives();
}

function hasYamlFrontmatter(source: string): boolean {
	return /^\s*\/\*---/.test(source);
}

function formatBuiltinSource(primitive: NodePrimitive, wgslBody: string): string {
	const lines = [
		`id: ${primitive.id}`,
		`entry: ${primitive.wgsl.entry}`,
		`category: ${primitive.category}`
	];

	if (primitive.metadata?.description) {
		lines.push(`description: ${JSON.stringify(primitive.metadata.description)}`);
	}

	if (primitive.metadata?.help) {
		lines.push(`help: ${JSON.stringify(primitive.metadata.help)}`);
	}

	if (primitive.metadata?.usage) {
		lines.push(`usage: ${JSON.stringify(primitive.metadata.usage)}`);
	}

	if (primitive.inputs.length > 0) {
		lines.push('inputs:');
		for (const port of primitive.inputs) {
			lines.push(`  ${port.name}:`);
			if (port.space && port.space !== 'none') {
				lines.push(`    space: ${port.space}`);
			}
		}
	}

	const defaults = Value.Create(primitive.params) as Record<string, unknown>;
	const paramKeys = Object.keys(defaults);
	if (paramKeys.length > 0) {
		lines.push('params:');
		for (const key of paramKeys) {
			lines.push(`  ${key}:`);
			const value = defaults[key];
			if (typeof value === 'number') {
				lines.push(`    default: ${value}`);
			} else if (typeof value === 'boolean') {
				lines.push(`    default: ${value}`);
			}
		}
	}

	if (primitive.outputs.length > 0) {
		lines.push('outputs:');
		for (const port of primitive.outputs) {
			lines.push(`  ${port.name}:`);
		}
	}

	return `/*---\n${lines.join('\n')}\n---*/\n${wgslBody.trim()}\n`;
}

function isStructuralPipelinePrimitive(primitive: NodePrimitive): boolean {
	const role = primitive.metadata?.role;
	return role !== undefined && STRUCTURAL_PIPELINE_ROLES.has(role);
}

function isFabricatedPipelineStub(source: string): boolean {
	return /fn\s+\w+\([^)]*\)\s*\{\s*\}/.test(source);
}

function formatStructuralNodeNotice(primitive: NodePrimitive): string {
	return `/*---\nid: ${primitive.id}\nentry: ${primitive.wgsl.entry}\ncategory: ${primitive.category}\nrole: ${primitive.metadata?.role ?? 'structural'}\n---*/\n// ${STRUCTURAL_NODE_NOTICE}\n`;
}

function resolveBuiltinWgslBody(moduleId: string): string | null {
	const mod = STANDARD_LIBRARY_MODULES[moduleId];
	return mod?.source ?? null;
}

function rewriteFrontmatterId(source: string, userId: string): string {
	return source.replace(/^id: .*$/m, `id: ${userId}`);
}

export function isBuiltinPrimitive(id: string): boolean {
	ensureReady();
	return !isUserPrimitiveId(id) && getPrimitive(id) !== undefined;
}

export function isEditablePrimitive(id: string): boolean {
	ensureReady();
	return isUserPrimitiveId(id) && getPrimitive(id) !== undefined;
}

export function getDefaultPrimitiveSource(moduleId: string): string {
	ensureReady();

	const userStored = listUserPrimitiveSources().get(moduleId);
	if (userStored) return userStored;

	const primitive = getPrimitive(moduleId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${moduleId}`);
	}

	const wgslBody = resolveBuiltinWgslBody(primitive.wgsl.moduleId);
	if (wgslBody === null) {
		if (isStructuralPipelinePrimitive(primitive)) {
			return formatStructuralNodeNotice(primitive);
		}
		return `/*---\nid: ${moduleId}\nentry: ${primitive.wgsl.entry}\ncategory: ${primitive.category}\n---*/\n// No WGSL source available for this module.\n`;
	}

	if (isStructuralPipelinePrimitive(primitive) && isFabricatedPipelineStub(wgslBody)) {
		return formatStructuralNodeNotice(primitive);
	}

	if (hasYamlFrontmatter(wgslBody)) {
		return `${wgslBody.trim()}\n`;
	}

	return formatBuiltinSource(primitive, wgslBody);
}

export function getPrimitiveSource(moduleId: string): string {
	ensureReady();
	return sourceOverrides.get(moduleId) ?? getDefaultPrimitiveSource(moduleId);
}

export function setPrimitiveSource(moduleId: string, source: string): void {
	if (isBuiltinPrimitive(moduleId)) {
		throw new Error('Built-in primitives are read-only');
	}
	sourceOverrides.set(moduleId, source);
	if (isUserPrimitiveId(moduleId)) {
		persistUserPrimitiveSource(moduleId, source);
	}
}

export function defaultCloneUserId(builtinId: string): string {
	let candidate = `user.${builtinId.replace(/\./g, '-')}-copy`;
	let suffix = 2;
	while (getPrimitive(candidate)) {
		candidate = `user.${builtinId.replace(/\./g, '-')}-copy-${suffix}`;
		suffix += 1;
	}
	return candidate;
}

export function cloneBuiltinPrimitive(builtinId: string, userId?: string): string {
	ensureReady();
	if (!isBuiltinPrimitive(builtinId)) {
		throw new Error(`Cannot clone non-built-in primitive: ${builtinId}`);
	}

	const targetId = userId ?? defaultCloneUserId(builtinId);
	if (!isUserPrimitiveId(targetId)) {
		throw new Error('Cloned primitive ids must start with user.');
	}
	if (getPrimitive(targetId)) {
		throw new Error(`Primitive already registered: ${targetId}`);
	}

	const source = rewriteFrontmatterId(getDefaultPrimitiveSource(builtinId), targetId);
	const previous = getPrimitive(builtinId);
	registerUserPrimitiveFromSource(targetId, source, previous?.evalCPU);
	sourceOverrides.set(targetId, source);
	return targetId;
}

export function isFabricatedReturnZeroStub(source: string, entryName: string): boolean {
	return new RegExp(`fn\\s+${entryName}\\s*\\([^)]*\\)\\s*\\{\\s*return\\s+0\\.0;\\s*\\}`).test(
		source
	);
}

/** Reset in-memory source overrides — for tests. */
export function resetPrimitiveSources(): void {
	sourceOverrides.clear();
}

export { STUB_MARKER };
