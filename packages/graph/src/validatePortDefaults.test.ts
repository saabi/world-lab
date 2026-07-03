import { describe, expect, it } from 'vitest';
import './primitives/index.js';
import { validateGraphCompleteness } from './validate.js';
import type { GraphDocument } from './types.js';

describe('@world-lab/graph validateGraphCompleteness port defaults', () => {
	it('does not warn for unconnected inputs that declare a default', () => {
		const doc: GraphDocument = {
			version: '2',
			nodes: [
				{
					id: 'n_vec4',
					primitive: 'vector.vec4f',
					inputs: [
						{ id: 'x', name: 'x', direction: 'in', dataType: 'f32', default: 0 },
						{ id: 'y', name: 'y', direction: 'in', dataType: 'f32', default: 0 },
						{ id: 'z', name: 'z', direction: 'in', dataType: 'f32', default: 0 },
						{ id: 'w', name: 'w', direction: 'in', dataType: 'f32', default: 1 }
					],
					outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'vec4f' }]
				}
			],
			edges: [],
			outputs: [{ name: 'color', from: { node: 'n_vec4', port: 'value' } }],
		};

		const result = validateGraphCompleteness(doc);
		expect(result.ok).toBe(true);
		expect(result.issues.some((issue) => issue.kind === 'unconnected-input')).toBe(false);
	});
});
