import { Type } from '@world-lab/schema';
import { describe, expect, it } from 'vitest';
import type { NodePrimitive } from '@world-lab/graph';

import { instantiateNodeInputs } from './nodePortUtils.js';

describe('@world-lab/graph-editor nodePortUtils', () => {
	it('instantiates open spaces and canonical semantic tags together', () => {
		const primitive: NodePrimitive = {
			id: 'test.semantic-instantiation',
			category: 'test',
			inputs: [
				{
					name: 'sample',
					dataType: 'f32',
					space: 'stereo_field',
					semantics: ['unit:m', 'color:linear-srgb', 'unit:m']
				}
			],
			outputs: [],
			params: Type.Object({}),
			wgsl: { moduleId: 'test.semantic-instantiation', entry: 'semanticInstantiation' }
		};

		expect(instantiateNodeInputs(primitive)[0]).toMatchObject({
			space: 'stereo_field',
			semantics: ['color:linear-srgb', 'unit:m']
		});
	});
});
