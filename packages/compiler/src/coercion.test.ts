import { resolveCoercion } from '@world-lab/graph';
import { describe, expect, it } from 'vitest';

import { emitCoercion } from './coercion.js';

describe('emitCoercion', () => {
	it('preserves identity and vec2f to vec3f WGSL output', () => {
		const identity = resolveCoercion(
			{ kind: 'scalar', scalar: 'f32' },
			{ kind: 'scalar', scalar: 'f32' }
		);
		const pad = resolveCoercion(
			{ kind: 'vector', element: 'f32', width: 2 },
			{ kind: 'vector', element: 'f32', width: 3 }
		);
		expect(identity && emitCoercion(identity, 'value')).toBe('value');
		expect(pad && emitCoercion(pad, 'value')).toBe('vec3<f32>(value, 0.0)');
	});
});
