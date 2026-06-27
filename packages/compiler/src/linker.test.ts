import { describe, expect, it } from 'vitest';
import { textLinker } from './linker.js';

const modules: Record<string, string> = {
	'util.used': 'fn used() -> f32 { return 1.0; }',
	'util.unused': 'fn unused() -> f32 { return 9.0; }',
	'main': 'fn main_fn() -> f32 { return used(); }',
};

describe('@virtual-planet/compiler textLinker', () => {
	it('drops helpers the entry does not reach (WGSL-level DCE)', () => {
		const out = textLinker.link({ entry: 'main', modules });
		expect(out).toContain('fn main_fn()');
		expect(out).toContain('fn used()');
		expect(out).not.toContain('fn unused()');
	});

	it('emits callees before callers', () => {
		const out = textLinker.link({ entry: 'main', modules });
		expect(out.indexOf('fn used()')).toBeLessThan(out.indexOf('fn main_fn()'));
	});

	it('deduplicates a shared helper', () => {
		const m: Record<string, string> = {
			'h': 'fn h() -> f32 { return 1.0; }',
			'a': 'fn a() -> f32 { return h(); }',
			'main': 'fn main_fn() -> f32 { return a() + h(); }',
		};
		const out = textLinker.link({ entry: 'main', modules: m });
		expect(out.match(/fn h\(\)/g)).toHaveLength(1);
	});

	it('throws on an unknown entry module', () => {
		expect(() => textLinker.link({ entry: 'nope', modules })).toThrow();
	});
});
