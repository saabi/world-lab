import { describe, expect, it, beforeEach } from 'vitest';
import { getPrimitive, listPrimitives } from '@virtual-planet/graph';

import {
	cloneBuiltinPrimitive,
	getDefaultPrimitiveSource,
	getPrimitiveSource,
	isBuiltinPrimitive,
	isEditablePrimitive,
	resetPrimitiveSources,
	STUB_MARKER
} from './primitiveSources.js';
import { resetUserPrimitives } from './userPrimitives.js';

describe('@virtual-planet/graph-editor primitiveSources', () => {
	beforeEach(() => {
		resetPrimitiveSources();
		resetUserPrimitives();
	});

	it('shows real math.remap WGSL from procedural-wgsl, not a fabricated stub', () => {
		const source = getDefaultPrimitiveSource('math.remap');
		expect(source).toContain('fn remap(');
		expect(source).toContain('subtract(');
		expect(source).toContain('divide(');
		expect(source).toContain('// @use math.subtract');
		expect(source).not.toContain(STUB_MARKER);
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
