import { describe, expect, it } from 'vitest';

import { NOISE_PERLIN3D_SOURCE } from '../fixtures/perlin3d.source.js';
import { splitPrimitiveSource } from './primitiveSourceLanguage.js';

describe('splitPrimitiveSource', () => {
	it('splits noise.perlin3d fixture into frontmatter and WGSL body', () => {
		const { frontmatter, body } = splitPrimitiveSource(NOISE_PERLIN3D_SOURCE);
		expect(frontmatter.startsWith('/*---')).toBe(true);
		expect(frontmatter.endsWith('---*/')).toBe(true);
		expect(frontmatter).toContain('id: noise.perlin3d');
		expect(body).toContain('fn perlin3d');
	});

	it('returns full text as body when no frontmatter delimiter', () => {
		const source = 'fn main() -> f32 { return 0.0; }';
		expect(splitPrimitiveSource(source)).toEqual({ frontmatter: '', body: source });
	});
});
