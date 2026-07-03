import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '@world-lab/graph';

import { derivePortBindings } from './portBindings.js';

describe('@world-lab/graph-editor port bindings', () => {
	it('preserves port space and semantic tags', () => {
		const doc: GraphDocument = {
			version: '1',
			nodes: [
				{
					id: 'n',
					primitive: 'test.binding',
					inputs: [
						{
							id: 'value',
							name: 'value',
							direction: 'in',
							dataType: 'f32',
							space: 'stereo_field',
							semantics: ['color:linear-srgb', 'unit:m']
						}
					],
					outputs: []
				}
			],
			edges: [],
			outputs: [],
			consumers: []
		};

		expect(derivePortBindings(doc, 'n')[0]).toMatchObject({
			space: 'stereo_field',
			semantics: ['color:linear-srgb', 'unit:m']
		});
	});
});
