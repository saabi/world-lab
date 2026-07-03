import { describe, expect, it } from 'vitest';
import type { NodePrimitive } from '@world-lab/graph';
import {
	annotationsOf,
	check,
	sectionsOf,
	Type,
	X_EXTENT,
	X_SCALE_BEHAVIOR,
	X_SECTION,
	X_SECTIONS,
	X_UNIT,
	X_WIDGET,
	type TSchema,
} from '@world-lab/schema';
import {
	loadWgslPrimitive,
	textWgslSignatureReader,
	type WgslFnSignature,
	type WgslSignatureReader,
} from './primitiveLoader.js';

const PERLIN_SOURCE = `/*---
id: noise.perlin3d
entry: perlin3d
category: Noise
description: Classic Perlin noise over a 3D position.
pure: true
deterministic: true
color: "#5d8cff"
icon: perlin
keywords: [noise, fbm]

sections:
  - { id: frequency, label: Frequency, order: 10, collapsed: false }

inputs:
  position:
    semantic: body-direction
    space: body_dir
    unit: none

params:
  scale:
    unit: 1/m
    widget: slider
    min: 0.0001
    max: 1
    default: 0.002
    section: frequency
    scaleBehavior: freq

outputs:
  value:
    semantic: scalar-field
    range: [0, 1]
---*/
// @use noise.hash
fn perlin3d(position: vec3<f32>, scale: f32) -> f32 {
	return 0.0;
}
`;

const EXPECTED_PERLIN: NodePrimitive = {
	id: 'noise.perlin3d',
	category: 'Noise',
	inputs: [
		{
			name: 'position',
			dataType: 'vec3f',
			space: 'body_dir',
			metadata: {
				semantic: 'body-direction',
				unit: 'none',
				wgslType: 'vec3<f32>',
			},
		},
	],
	outputs: [
		{
			name: 'value',
			dataType: 'f32',
			metadata: {
				semantic: 'scalar-field',
				range: [0, 1],
				wgslType: 'f32',
			},
		},
	],
	params: Type.Object(
		{
			scale: Type.Number({
				default: 0.002,
				minimum: 0.0001,
				maximum: 1,
				[X_EXTENT]: [0.0001, 1],
				[X_UNIT]: '1/m',
				[X_WIDGET]: 'slider',
				[X_SECTION]: 'frequency',
				[X_SCALE_BEHAVIOR]: 'freq',
			}),
		},
		{
			[X_SECTIONS]: [{ id: 'frequency', label: 'Frequency', order: 10, collapsed: false }],
		},
	),
	implementation: {
		kind: 'wgsl-function',
		moduleId: 'noise.perlin3d',
		entry: 'perlin3d'
	},
	wgsl: {
		moduleId: 'noise.perlin3d',
		entry: 'perlin3d',
		arguments: [
			{ name: 'position', source: 'input' },
			{ name: 'scale', source: 'param' },
		],
	},
	metadata: {
		description: 'Classic Perlin noise over a 3D position.',
		pure: true,
		deterministic: true,
		color: '#5d8cff',
		icon: 'perlin',
		keywords: ['noise', 'fbm'],
	},
};

describe('@world-lab/compiler loadWgslPrimitive', () => {
	it('loads the example primitive to the hand-written NodePrimitive shape', () => {
		const loaded = loadWgslPrimitive({
			moduleId: 'noise.perlin3d',
			source: PERLIN_SOURCE,
		});
		expect(loaded.primitive).toEqual(EXPECTED_PERLIN);
	});

	it('accepts open spaces and canonicalizes semantic tags from frontmatter', () => {
		const source = PERLIN_SOURCE.replace(
			'    space: body_dir',
			'    space: stereo_field\n    semantics: [unit:m, color:linear-srgb, unit:m]'
		).replace(
			'    range: [0, 1]',
			'    range: [0, 1]\n    space: spectrum_field\n    semantics: [unit:ratio, color:linear-srgb, unit:ratio]'
		);

		const loaded = loadWgslPrimitive({
			moduleId: 'noise.perlin3d',
			source
		});

		expect(loaded.primitive.inputs[0]).toMatchObject({
			space: 'stereo_field',
			semantics: ['color:linear-srgb', 'unit:m']
		});
		expect(loaded.primitive.outputs[0]).toMatchObject({
			space: 'spectrum_field',
			semantics: ['color:linear-srgb', 'unit:ratio']
		});
	});

	it('preserves input/param classification, argument order, and exact wgslType metadata', () => {
		const loaded = loadWgslPrimitive({
			moduleId: 'noise.perlin3d',
			source: PERLIN_SOURCE,
		});
		expect(loaded.primitive.inputs.map((port) => port.name)).toEqual(['position']);
		expect(loaded.primitive.inputs[0]?.metadata?.wgslType).toBe('vec3<f32>');
		expect(loaded.primitive.outputs[0]?.metadata?.wgslType).toBe('f32');
		expect(loaded.primitive.wgsl!.arguments).toEqual([
			{ name: 'position', source: 'input' },
			{ name: 'scale', source: 'param' },
		]);
	});

	it('exposes the merged TypeBox param schema through shared introspection', () => {
		const { primitive } = loadWgslPrimitive({
			moduleId: 'noise.perlin3d',
			source: PERLIN_SOURCE,
		});
		const scale = (primitive.params as unknown as { properties: Record<string, unknown> })
			.properties.scale;
		expect(annotationsOf(scale as TSchema)).toMatchObject({
			default: 0.002,
			extent: [0.0001, 1],
			unit: '1/m',
			widget: 'slider',
			section: 'frequency',
			scaleBehavior: 'freq',
		});
		expect(sectionsOf(primitive.params)).toEqual([
			{ id: 'frequency', label: 'Frequency', order: 10, collapsed: false },
		]);
		expect(check(primitive.params, { scale: 0.2 })).toBe(true);
		expect(check(primitive.params, { scale: 2 })).toBe(false);
	});

	it('maps i32 and bool authored parameters to TypeBox fields', () => {
		const source = `/*---
id: test.scalar-params
category: Test
params:
  count: { default: 3, min: 1, max: 8 }
  enabled: { default: true }
outputs:
  value:
---*/
fn scalar_params(count: i32, enabled: bool) -> f32 { return 0.0; }`;
		const { primitive } = loadWgslPrimitive({ moduleId: 'test.scalar-params', source });
		expect(check(primitive.params, { count: 4, enabled: false })).toBe(true);
		expect(check(primitive.params, { count: 4.5, enabled: false })).toBe(false);
		expect(primitive.wgsl!.arguments).toEqual([
			{ name: 'count', source: 'param' },
			{ name: 'enabled', source: 'param' },
		]);
	});

	it('orders and deduplicates // @use imports', () => {
		const source = `${PERLIN_SOURCE}\n// @use math.remap\n// @use noise.hash`;
		const loaded = loadWgslPrimitive({ moduleId: 'noise.perlin3d', source });
		expect(loaded.imports).toEqual(['noise.hash', 'math.remap']);
	});

	it('accepts an injected signature reader', () => {
		const reader: WgslSignatureReader = {
			readSignatures(): WgslFnSignature[] {
				return [
					{
						name: 'custom',
						parameters: [{ name: 'x', type: 'f32' }],
						returnType: 'f32',
					},
				];
			},
			readImports() {
				return ['injected.mod'];
			},
		};
		const source = `/*---
id: test.custom
category: Test
inputs:
  x:
outputs:
  out:
---*/
fn ignored() -> f32 { return 0.0; }`;
		const loaded = loadWgslPrimitive({
			moduleId: 'mod.custom',
			source,
			reader,
		});
		expect(loaded.primitive.wgsl!.entry).toBe('custom');
		expect(loaded.primitive.inputs).toEqual([
			{ name: 'x', dataType: 'f32', metadata: { wgslType: 'f32' } },
		]);
		expect(loaded.imports).toEqual(['injected.mod']);
	});

	it('allows omitting entry when exactly one function is present', () => {
		const source = `/*---
id: test.single
category: Test
inputs:
  x:
outputs:
  value:
---*/
fn only_fn(x: f32) -> f32 { return x; }`;
		const loaded = loadWgslPrimitive({ moduleId: 'mod.single', source });
		expect(loaded.primitive.wgsl!.entry).toBe('only_fn');
	});

	it('requires entry when multiple functions are present', () => {
		const source = `/*---
id: test.multi
category: Test
outputs:
  value:
---*/
fn a() -> f32 { return 0.0; }
fn b() -> f32 { return 1.0; }`;
		expect(() => loadWgslPrimitive({ moduleId: 'mod.multi', source })).toThrow();
	});

	it('ignores function-like text and @use directives inside comments', () => {
		const source = `/*---
id: test.comments
category: Test
inputs:
  x:
outputs:
  value:
---*/
/* fn fake() -> f32 { // @use ignored.mod } */
// fn also_ignored() -> f32
fn real(x: f32) -> f32 { return x; }`;
		const loaded = loadWgslPrimitive({ moduleId: 'mod.comments', source });
		expect(loaded.primitive.wgsl!.entry).toBe('real');
		expect(loaded.imports).toEqual([]);
	});

	it('throws on unsupported WGSL port types', () => {
		const source = `/*---
id: test.bad
category: Test
inputs:
  x:
outputs:
  value:
---*/
fn bad(x: texture_2d<f32>) -> f32 { return 0.0; }`;
   expect(() => loadWgslPrimitive({ moduleId: 'mod.bad', source })).toThrow(
    /Unsupported data type/,
   );
	});

	it('throws on malformed frontmatter and unknown keys', () => {
		expect(() =>
			loadWgslPrimitive({
				moduleId: 'mod.bad',
				source: 'fn x() -> f32 { return 0.0; }',
			}),
		).toThrow(/Missing YAML frontmatter/);

		expect(() =>
			loadWgslPrimitive({
				moduleId: 'mod.bad',
				source: `/*---
id: test
category: Test
extra: nope
outputs:
  value:
---*/
fn x() -> f32 { return 0.0; }`,
			}),
		).toThrow(/Unknown frontmatter key/);
	});

	it('throws on mismatched input names and invalid section references', () => {
		expect(() =>
			loadWgslPrimitive({
				moduleId: 'mod.bad',
				source: `/*---
id: test
category: Test
sections:
  - { id: known }
inputs:
  missing:
    section: known
outputs:
  value:
---*/
fn x(a: f32) -> f32 { return a; }`,
			}),
		).toThrow(/Unknown input annotation/);

		expect(() =>
			loadWgslPrimitive({
				moduleId: 'mod.bad',
				source: `/*---
id: test
category: Test
sections:
  - { id: known }
params:
  a:
    default: 0
    section: missing
outputs:
  value:
---*/
fn x(a: f32) -> f32 { return a; }`,
			}),
		).toThrow(/Unknown section reference/);
	});

	it('rejects missing/duplicate classifications and wrong param defaults', () => {
		const source = (classification: string) => `/*---
id: test.classification
category: Test
${classification}
outputs:
  value:
---*/
fn x(a: f32) -> f32 { return a; }`;

		expect(() =>
			loadWgslPrimitive({ moduleId: 'mod.bad', source: source('') }),
		).toThrow(/classified exactly once/);
		expect(() =>
			loadWgslPrimitive({
				moduleId: 'mod.bad',
				source: source('inputs: { a: {} }\nparams: { a: { default: 0 } }'),
			}),
		).toThrow(/classified exactly once/);
		expect(() =>
			loadWgslPrimitive({
				moduleId: 'mod.bad',
				source: source('params: { a: { default: false } }'),
			}),
		).toThrow(/Invalid params.a.default/);
	});

	it('throws on invalid dependency directives', () => {
		expect(() =>
			loadWgslPrimitive({
				moduleId: 'mod.bad',
				source: `/*---
id: test
category: Test
outputs:
  value:
---*/
// @use
fn x() -> f32 { return 0.0; }`,
			}),
		).toThrow(/Invalid @use/);
	});

	it('accepts vec2f alias in WGSL signatures', () => {
		const loaded = loadWgslPrimitive({
			moduleId: 'test.vec2Alias',
			source: `/*---
id: test.vec2Alias
category: Test
inputs:
  value:
  scalar:
outputs:
  value:
---*/
fn scale(value: vec2f, scalar: f32) -> vec2f {
	return value * scalar;
}`
		});
		expect(loaded.primitive.inputs[0]?.dataType).toBe('vec2f');
		expect(loaded.primitive.outputs[0]?.dataType).toBe('vec2f');
	});
});
