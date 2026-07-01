import { describe, expect, it, beforeEach } from 'vitest';
import { getPrimitive, listPrimitives } from '@virtual-planet/graph';

import {
	cloneBuiltinPrimitive,
	getDefaultPrimitiveSource,
	getPrimitiveSource,
	isBuiltinPrimitive,
	isEditablePrimitive,
	isFabricatedReturnZeroStub,
	resetPrimitiveSources,
	STRUCTURAL_NODE_NOTICE,
	STUB_MARKER
} from './primitiveSources.js';
import { resetUserPrimitives } from './userPrimitives.js';

describe('@virtual-planet/graph-editor primitiveSources', () => {
	beforeEach(() => {
		resetPrimitiveSources();
		resetUserPrimitives();
	});

	it('includes help in synthesized frontmatter when metadata provides it', () => {
		const source = getDefaultPrimitiveSource('math.min');
		expect(source).toContain('help:');
		expect(source).toContain('SDF union');
	});

	it('shows real math.remap WGSL from procedural-wgsl, not a fabricated stub', () => {
		const source = getDefaultPrimitiveSource('math.remap');
		expect(source).toContain('fn remap(');
		expect(source).toContain('subtract(');
		expect(source).toContain('divide(');
		expect(source).toContain('// @use math.subtract');
		expect(source).not.toContain(STUB_MARKER);
	});

	it('shows real sdf.opSubtract group WGSL with declared deps', () => {
		const source = getDefaultPrimitiveSource('sdf.opSubtract');
		expect(source).toContain('fn opSubtract(');
		expect(source).toContain('// @use');
		expect(source).not.toContain(STUB_MARKER);
	});

	it('shows real geometry.plane grid WGSL with plane_grid_position', () => {
		const source = getDefaultPrimitiveSource('geometry.plane');
		expect(source).toContain('fn plane_grid_position(');
		expect(source).toContain('fn planeGrid(');
		expect(source).not.toContain(STUB_MARKER);
	});

	it('shows structural notice for pipeline fragment nodes instead of empty stubs', () => {
		const source = getDefaultPrimitiveSource('stage.fragment');
		expect(source).toContain(STRUCTURAL_NODE_NOTICE);
		expect(source).not.toMatch(/fn\s+fragmentStage\([^)]*\)\s*\{\s*\}/);
		expect(source).not.toContain(STUB_MARKER);
	});

	it('never returns fabricated return 0.0 entry stubs for registered primitives', () => {
		for (const primitive of listPrimitives()) {
			if (!primitive.wgsl?.moduleId) continue;
			const source = getDefaultPrimitiveSource(primitive.id);
			expect(isFabricatedReturnZeroStub(source, primitive.wgsl.entry)).toBe(false);
		}
	});

	it('marks standard-library primitives as built-in and non-editable', () => {
		expect(isBuiltinPrimitive('math.remap')).toBe(true);
		expect(isEditablePrimitive('math.remap')).toBe(false);
	});

	it('clone produces an editable user primitive without mutating the built-in source', () => {
		const before = getDefaultPrimitiveSource('math.remap');
		const userId = 'user.test-remap-clone';
		if (!getPrimitive(userId)) {
			cloneBuiltinPrimitive('math.remap', userId);
		}

		expect(userId.startsWith('user.')).toBe(true);
		expect(isBuiltinPrimitive(userId)).toBe(false);
		expect(isEditablePrimitive(userId)).toBe(true);
		expect(listPrimitives().map((primitive) => primitive.id)).toContain(userId);
		expect(getDefaultPrimitiveSource('math.remap')).toBe(before);
		expect(getPrimitiveSource(userId)).toContain('fn remap(');
		expect(getPrimitive('math.remap')).toBeDefined();
	});
});
