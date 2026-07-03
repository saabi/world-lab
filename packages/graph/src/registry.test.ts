import { describe, expect, it } from 'vitest';
import {
	getPrimitive,
	listPrimitives,
	registerPrimitive,
	replacePrimitive,
	type NodePrimitive
} from '@world-lab/graph';
import { Type } from '@world-lab/schema';

describe('@world-lab/graph replacePrimitive', () => {
	it('replaces an existing registration without changing list order', () => {
		const before = getPrimitive('math.clamp')!;
		const replacement: NodePrimitive = {
			...before,
			category: 'math-edited'
		};

		replacePrimitive(replacement);

		expect(getPrimitive('math.clamp')?.category).toBe('math-edited');
		expect(listPrimitives().map((primitive) => primitive.id)).toContain('math.clamp');

		replacePrimitive(before);
	});

	it('canonicalizes semantic tags at registration and replacement boundaries', () => {
		const primitive: NodePrimitive = {
			id: 'test.semantic-registration',
			category: 'test',
			inputs: [
				{
					name: 'value',
					dataType: 'f32',
					space: 'stereo_field',
					semantics: ['unit:m', 'color:linear-srgb', 'unit:m']
				}
			],
			outputs: [{ name: 'out', dataType: 'f32' }],
			params: Type.Object({}),
			wgsl: { moduleId: 'test.semantic-registration', entry: 'semanticRegistration' }
		};

		if (!getPrimitive(primitive.id)) {
			registerPrimitive(primitive);
		}
		expect(getPrimitive(primitive.id)?.inputs[0]?.semantics).toEqual([
			'color:linear-srgb',
			'unit:m'
		]);

		replacePrimitive({
			...primitive,
			inputs: [{ ...primitive.inputs[0]!, semantics: ['z', 'a', 'z'] }]
		});
		expect(getPrimitive(primitive.id)?.inputs[0]?.semantics).toEqual(['a', 'z']);
	});
});
