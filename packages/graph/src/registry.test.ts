import { describe, expect, it } from 'vitest';
import {
	getPrimitive,
	listPrimitives,
	normalizePrimitiveInput,
	registerPrimitive,
	replacePrimitive,
	type NodePrimitive,
	type NodePrimitiveInput
} from '@world-lab/graph';
import { Type } from '@world-lab/schema';

describe('@world-lab/graph replacePrimitive', () => {
	it('normalizes wgsl and implementation authoring through the same boundary', () => {
		const legacy = normalizePrimitiveInput({
			id: 'test.legacy-wgsl-input',
			category: 'test',
			inputs: [],
			outputs: [{ name: 'value', dataType: 'f32' }],
			params: Type.Object({}),
			wgsl: {
				moduleId: 'test.legacy-wgsl-input',
				entry: 'legacyWgslInput',
				arguments: [{ name: 'value', source: 'param' }]
			}
		});
		expect(legacy.implementation).toEqual({
			kind: 'wgsl-function',
			moduleId: 'test.legacy-wgsl-input',
			entry: 'legacyWgslInput'
		});
		expect(legacy.wgsl?.arguments).toEqual([{ name: 'value', source: 'param' }]);

		const group = normalizePrimitiveInput({
			id: 'test.group-input',
			category: 'test',
			inputs: [],
			outputs: [],
			params: Type.Object({}),
			implementation: { kind: 'group', groupId: 'test.exampleGroup' }
		});
		expect(group.wgsl).toEqual({
			moduleId: 'test.exampleGroup',
			entry: 'exampleGroup'
		});

		expect(() =>
			normalizePrimitiveInput({
				id: 'test.invalid-sink-wgsl',
				category: 'test',
				inputs: [],
				outputs: [],
				params: Type.Object({}),
				implementation: { kind: 'legacy-structural', marker: 'invalid' },
				wgsl: { moduleId: 'invalid', entry: 'invalid' }
			})
		).toThrow('Non-callable primitive implementation cannot declare wgsl');
	});

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
		const primitive: NodePrimitiveInput = {
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

	it('validates kernel binding declarations at registration time', () => {
		expect(() =>
			registerPrimitive({
				id: 'test.invalid-kernel-duplicate-binding',
				category: 'test',
				inputs: [],
				outputs: [],
				params: Type.Object({}),
				implementation: {
					kind: 'kernel',
					stage: 'compute',
					bindings: [
						{
							name: 'state',
							binding: 0,
							resourceKind: 'buffer',
							access: 'read-write',
							stages: ['compute']
						},
						{
							name: 'next',
							binding: 0,
							resourceKind: 'buffer',
							access: 'write',
							stages: ['compute']
						}
					]
				}
			})
		).toThrow('Duplicate kernel binding index');

		expect(() =>
			registerPrimitive({
				id: 'test.invalid-kernel-stage-visibility',
				category: 'test',
				inputs: [],
				outputs: [],
				params: Type.Object({}),
				implementation: {
					kind: 'kernel',
					stage: 'compute',
					bindings: [
						{
							name: 'state',
							binding: 0,
							resourceKind: 'buffer',
							access: 'read-write',
							stages: ['fragment']
						}
					]
				}
			})
		).toThrow('is not visible in its owning kernel');
	});
});
