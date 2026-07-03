import { resolveCoercion } from '@world-lab/graph';
import { describe, expect, it } from 'vitest';

import { applyCoercion } from './coercion.js';

describe('applyCoercion', () => {
	it('preserves identity and pads vec2f to vec3f', () => {
		const identity = resolveCoercion(
			{ kind: 'scalar', scalar: 'f32' },
			{ kind: 'scalar', scalar: 'f32' }
		)!;
		const pad = resolveCoercion(
			{ kind: 'vector', element: 'f32', width: 2 },
			{ kind: 'vector', element: 'f32', width: 3 }
		)!;
		expect(applyCoercion(identity, 2)).toBe(2);
		expect(applyCoercion(pad, [1, 2])).toEqual([1, 2, 0]);
	});
});
