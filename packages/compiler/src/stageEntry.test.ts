import { describe, expect, it } from 'vitest';
import type { ConsumerShader } from './compileGraph.js';
import { assembleStageEntry, bindingDeclKindForTemplate, type BindingDecl } from './stageEntry.js';

function shader(stage: string, code: string, outputs = ['color']): ConsumerShader {
	return { consumerId: stage + '-c', stage, outputs, code, moduleIds: [] };
}

describe('@world-lab/compiler assembleStageEntry', () => {
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

	it('throws when no output fn is provided for the driving output', () => {
		expect(() => assembleStageEntry(shader('fragment', 'fn f() {}'), { outputFns: {} })).toThrow();
	});
});
