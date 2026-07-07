import { describe, expect, it } from 'vitest';
import type { ConsumerShader } from './compileGraph.js';
import {
	assembleStageEntry,
	assertVaryingsMatch,
	bindingDeclKindForTemplate,
	varyingsStructWgsl,
	type BindingDecl,
	type VaryingDecl
} from './stageEntry.js';

function shader(stage: string, code: string, outputs = ['color']): ConsumerShader {
	return { consumerId: stage + '-c', stage, outputs, code, moduleIds: [] };
}

describe('@world-lab/compiler assembleStageEntry', () => {
	it('emits the position-only varyings struct exactly like the legacy vertex template', () => {
		expect(varyingsStructWgsl('VSOut', [])).toBe(
			'struct VSOut {\n\t@builtin(position) position: vec4f,\n};'
		);
	});

	it('emits typed varying fields in declaration order', () => {
		expect(
			varyingsStructWgsl('VertexOut', [
				{ name: 'uv', wgslType: 'vec2f' },
				{ name: 'height', wgslType: 'f32' }
			])
		).toBe(
			'struct VertexOut {\n' +
				'\t@builtin(position) position: vec4f,\n' +
				'\t@location(0) uv: vec2f,\n' +
				'\t@location(1) height: f32,\n' +
				'};'
		);
	});

	it('validates varying field and struct names before emitting WGSL', () => {
		expect(() =>
			varyingsStructWgsl('VSOut', [
				{ name: 'uv', wgslType: 'vec2f' },
				{ name: 'uv', wgslType: 'vec2f' }
			])
		).toThrow('Duplicate varying name: "uv"');

		for (const name of ['', '1uv', 'bad name', 'bad-name']) {
			expect(() => varyingsStructWgsl('VSOut', [{ name, wgslType: 'vec2f' }])).toThrow(
				'invalid WGSL identifier'
			);
		}
		expect(() => varyingsStructWgsl('VSOut', [{ name: 'var', wgslType: 'vec2f' }])).toThrow(
			'reserved WGSL keyword'
		);
		expect(() => varyingsStructWgsl('bad-name', [])).toThrow('invalid WGSL identifier');
		expect(() => varyingsStructWgsl('struct', [])).toThrow('reserved WGSL keyword');
	});

	it('wraps a fragment consumer in @fragment fs_main calling its output fn', () => {
		const s = shader('fragment', 'fn cosine_palette(uv: vec2f, res: vec2f, t: f32) -> vec4f { return vec4f(0.0); }');
		const m = assembleStageEntry(s, {
			outputFns: { color: 'cosine_palette' },
			callArgs: ['position.xy', 'res', 'iTime'],
		});
		expect(m.stage).toBe('fragment');
		expect(m.code).toContain('@fragment');
		expect(m.code).toContain('fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f');
		expect(m.code).toContain('return cosine_palette(position.xy, res, iTime);');
		expect(m.code).toContain('fn cosine_palette('); // the function library is included
	});

	it('renders binding declarations in order before the library', () => {
		const bindings: BindingDecl[] = [
			{ group: 0, binding: 0, name: 'view_u', kind: 'uniform', wgslType: 'ViewUniforms' },
			{ group: 0, binding: 1, name: 'iChannel0', kind: 'texture', wgslType: 'texture_2d<f32>' },
			{ group: 3, binding: 0, name: 'patches', kind: 'storage-read', wgslType: 'array<Patch>' },
			{ group: 3, binding: 1, name: 'next', kind: 'storage-read-write', wgslType: 'array<f32>' },
		];
		const m = assembleStageEntry(shader('fragment', 'fn f() -> vec4f { return vec4f(0.0); }'), {
			bindings,
			outputFns: { color: 'f' },
		});
		expect(m.code).toContain('@group(0) @binding(0) var<uniform> view_u: ViewUniforms;');
		expect(m.code).toContain('@group(0) @binding(1) var iChannel0: texture_2d<f32>;');
		expect(m.code).toContain('@group(3) @binding(0) var<storage, read> patches: array<Patch>;');
		expect(m.code).toContain('@group(3) @binding(1) var<storage, read_write> next: array<f32>;');
		// decls precede the library
		expect(m.code.indexOf('view_u')).toBeLessThan(m.code.indexOf('fn f('));
	});

	it('maps kernel binding templates to compiler binding declaration kinds', () => {
		expect(bindingDeclKindForTemplate({ resourceKind: 'buffer', access: 'read' })).toBe('storage-read');
		expect(bindingDeclKindForTemplate({ resourceKind: 'buffer', access: 'read-write' })).toBe('storage-read-write');
		expect(bindingDeclKindForTemplate({ resourceKind: 'buffer', access: 'write' })).toBe('storage-read-write');
		expect(bindingDeclKindForTemplate({ resourceKind: 'texture', access: 'read' })).toBe('texture');
		expect(bindingDeclKindForTemplate({ resourceKind: 'sampler', access: 'read' })).toBe('sampler');
		expect(() => bindingDeclKindForTemplate({ resourceKind: 'texture', access: 'write' })).toThrow("texture kernel bindings must declare access:'read'");
		expect(() => bindingDeclKindForTemplate({ resourceKind: 'sampler', access: 'write' })).toThrow("sampler kernel bindings must declare access:'read'");
	});

	it('wraps a compute consumer in @compute with a workgroup size', () => {
		const m = assembleStageEntry(shader('compute', 'fn step() { }', ['state']), {
			workgroupSize: [8, 8, 1],
			outputFns: { state: 'step' },
		});
		expect(m.code).toContain('@compute @workgroupSize(8, 8, 1)');
		expect(m.code).toContain('fn cs_main(@builtin(global_invocation_id) gid: vec3u)');
		expect(m.code).toContain('step();');
	});

	it('supports a vertex stage and entryOverride', () => {
		const v = assembleStageEntry(shader('vertex', 'fn displace() -> vec4f { return vec4f(0.0); }', ['pos']), {
			outputFns: { pos: 'displace' },
		});
		expect(v.code).toContain('@vertex');
		expect(v.code).toContain('fn vs_main(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32)');

		const o = assembleStageEntry(shader('fragment', 'fn f() -> vec4f { return vec4f(0.0); }'), {
			outputFns: { color: 'f' },
			entryOverride: '@fragment fn custom() -> @location(0) vec4f { return f(); }',
		});
		expect(o.code).toContain('@fragment fn custom()');
	});

	it('assigns vertex varyings in declaration order', () => {
		const v = assembleStageEntry(
			shader('vertex', 'fn pos() -> vec4f { return vec4f(0.0); }\nfn uv() -> vec2f { return vec2f(0.0); }\nfn height() -> f32 { return 0.0; }', ['position']),
			{
				output: 'position',
				outputFns: { position: 'pos', uv: 'uv', height: 'height' },
				callArgs: ['vid', 'iid'],
				varyings: [
					{ name: 'uv', wgslType: 'vec2f' },
					{ name: 'height', wgslType: 'f32' }
				]
			}
		);
		expect(v.code).toContain('fn vs_main(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VSOut');
		expect(v.code).toContain('\tout.position = pos(vid, iid);\n\tout.uv = uv(vid, iid);\n\tout.height = height(vid, iid);\n\treturn out;');
		expect(v.code.indexOf('out.position')).toBeLessThan(v.code.indexOf('out.uv'));
		expect(v.code.indexOf('out.uv')).toBeLessThan(v.code.indexOf('out.height'));
	});

	it('throws when a vertex varying has no output fn', () => {
		expect(() =>
			assembleStageEntry(shader('vertex', 'fn pos() -> vec4f { return vec4f(0.0); }', ['position']), {
				output: 'position',
				outputFns: { position: 'pos' },
				varyings: [{ name: 'uv', wgslType: 'vec2f' }]
			})
		).toThrow("No output fn provided for varying 'uv'");
	});

	it('uses a struct-typed fragment input when varyings are declared', () => {
		const m = assembleStageEntry(shader('fragment', 'fn color(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'), {
			outputFns: { color: 'color' },
			callArgs: ['input.uv'],
			varyings: [{ name: 'uv', wgslType: 'vec2f' }]
		});
		expect(m.code).toContain('fn fs_main(input: VSOut) -> @location(0) vec4f');
		expect(m.code).toContain('return color(input.uv);');
		expect(m.code).not.toContain('struct VSOut');

		const custom = assembleStageEntry(shader('fragment', 'fn color(uv: vec2f) -> vec4f { return vec4f(uv, 0.0, 1.0); }'), {
			outputFns: { color: 'color' },
			callArgs: ['input.uv'],
			varyingsStructName: 'FragmentInput',
			varyings: [{ name: 'uv', wgslType: 'vec2f' }]
		});
		expect(custom.code).toContain('fn fs_main(input: FragmentInput) -> @location(0) vec4f');
	});

	it('validates fragment varyings even though it only references the struct', () => {
		expect(() =>
			assembleStageEntry(shader('fragment', 'fn color() -> vec4f { return vec4f(0.0); }'), {
				outputFns: { color: 'color' },
				varyings: [{ name: 'bad-name', wgslType: 'vec2f' }]
			})
		).toThrow('invalid WGSL identifier');
		expect(() =>
			assembleStageEntry(shader('fragment', 'fn color() -> vec4f { return vec4f(0.0); }'), {
				outputFns: { color: 'color' },
				varyingsStructName: 'var',
				varyings: [{ name: 'uv', wgslType: 'vec2f' }]
			})
		).toThrow('reserved WGSL keyword');
	});

	it('throws when no output fn is provided for the driving output', () => {
		expect(() => assembleStageEntry(shader('fragment', 'fn f() {}'), { outputFns: {} })).toThrow();
	});
});

describe('@world-lab/compiler assertVaryingsMatch', () => {
	const vertex: VaryingDecl[] = [
		{ name: 'uv', wgslType: 'vec2f' },
		{ name: 'height', wgslType: 'f32' }
	];

	it('rejects duplicate names before building lookup maps', () => {
		expect(() =>
			assertVaryingsMatch(
				[
					{ name: 'uv', wgslType: 'vec2f' },
					{ name: 'uv', wgslType: 'vec3f' }
				],
				[{ name: 'uv', wgslType: 'vec3f' }]
			)
		).toThrow('Duplicate varying name on the vertex side: "uv"');
		expect(() =>
			assertVaryingsMatch(
				[{ name: 'uv', wgslType: 'vec2f' }],
				[
					{ name: 'uv', wgslType: 'vec2f' },
					{ name: 'uv', wgslType: 'vec3f' }
				]
			)
		).toThrow('Duplicate varying name on the fragment side: "uv"');
	});

	it('accepts equal varying sets declared in different orders', () => {
		expect(() =>
			assertVaryingsMatch(vertex, [
				{ name: 'height', wgslType: 'f32' },
				{ name: 'uv', wgslType: 'vec2f' }
			])
		).not.toThrow();
	});

	it('reports missing, mismatched, and extra varyings clearly', () => {
		expect(() =>
			assertVaryingsMatch(vertex, [
				{ name: 'uv', wgslType: 'vec2f' },
				{ name: 'normal', wgslType: 'vec3f' }
			])
		).toThrow('fragment expects varying "normal" but the vertex kernel does not produce it');

		expect(() =>
			assertVaryingsMatch(vertex, [
				{ name: 'uv', wgslType: 'vec3f' },
				{ name: 'height', wgslType: 'f32' }
			])
		).toThrow('varying "uv" type mismatch: vertex produces vec2f, fragment expects vec3f');

		expect(() => assertVaryingsMatch(vertex, [{ name: 'uv', wgslType: 'vec2f' }])).toThrow(
			'vertex produces varying "height" that the fragment kernel does not declare'
		);
	});
});
