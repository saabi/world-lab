import {
	callableWgslSource,
	getPrimitive,
	type NodePrimitive,
	type WgslSourceRef
} from '@world-lab/graph';
import { Value } from '@world-lab/schema';
import { STANDARD_LIBRARY_MODULES } from '@world-lab/procedural-wgsl';

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
export const HOST_INPUT_NOTICE = '(no WGSL — host-provided input)';
export const SINK_NODE_NOTICE = '(no WGSL — sink node)';

const sourceOverrides = new Map<string, string>();

function ensureReady(): void {
	hydrateUserPrimitives();
}

function hasYamlFrontmatter(source: string): boolean {
	return /^\s*\/\*---/.test(source);
}

function formatBuiltinSource(
	primitive: NodePrimitive,
	wgsl: WgslSourceRef,
	wgslBody: string
): string {
	const lines = [
		`id: ${primitive.id}`,
		`entry: ${wgsl.entry}`,
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
				if (port.semantics !== undefined) {
					lines.push(`    semantics: ${JSON.stringify(port.semantics)}`);
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
				if (port.space && port.space !== 'none') {
					lines.push(`    space: ${port.space}`);
				}
				if (port.semantics !== undefined) {
					lines.push(`    semantics: ${JSON.stringify(port.semantics)}`);
				}
			}
	}

	return `/*---\n${lines.join('\n')}\n---*/\n${wgslBody.trim()}\n`;
}

function formatStructuralNodeNotice(primitive: NodePrimitive): string {
	const notice =
		primitive.implementation.kind === 'host-input'
			? HOST_INPUT_NOTICE
			: primitive.implementation.kind === 'sink'
				? SINK_NODE_NOTICE
				: STRUCTURAL_NODE_NOTICE;
	return `/*---\nid: ${primitive.id}\ncategory: ${primitive.category}\nimplementation: ${primitive.implementation.kind}\nrole: ${primitive.metadata?.role ?? 'structural'}\n---*/\n// ${notice}\n`;
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
	const wgsl = callableWgslSource(primitive);
	if (!wgsl) {
		return formatStructuralNodeNotice(primitive);
	}

	const wgslBody = resolveBuiltinWgslBody(wgsl.moduleId);
	if (wgslBody === null) {
		return `/*---\nid: ${moduleId}\nentry: ${wgsl.entry}\ncategory: ${primitive.category}\n---*/\n// No WGSL source available for this module.\n`;
	}

	if (hasYamlFrontmatter(wgslBody)) {
		return `${wgslBody.trim()}\n`;
	}

	return formatBuiltinSource(primitive, wgsl, wgslBody);
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
