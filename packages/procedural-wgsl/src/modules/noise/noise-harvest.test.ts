import { describe, expect, it } from 'vitest';
import {
	annotationsOf,
	fields,
	type TSchema
} from '@world-lab/schema';
import { getPrimitive, type PortSpec } from '@world-lab/graph';
import { loadWgslPrimitive, textLinker } from '@world-lab/compiler';
import '@world-lab/graph';

import {
	NOISE_BLUE2D_MODULE,
	NOISE_HASH2D_MODULE,
	NOISE_PERLIN2D_DERIV_MODULE,
	NOISE_PERLIN2D_MODULE,
	NOISE_VALUE2D_MODULE,
	NOISE_VORONOI2D_MODULE,
	NOISE_WORLEY2D_MODULE
} from './harvest2d.js';

function portNames(ports: PortSpec[]): string[] {
	return ports.map((port) => port.name);
}

function paramDefaults(schema: TSchema): Record<string, unknown> {
	return Object.fromEntries(
		fields(schema).map((field) => [field.key, annotationsOf(field.schema).default])
	);
}

function assertMechanicalParity(moduleId: string, source: string): void {
	const graphPrim = getPrimitive(moduleId)!;
	const loaded = loadWgslPrimitive({ moduleId, source }).primitive;

	expect(loaded.id).toBe(graphPrim.id);
	expect(loaded.category).toBe(graphPrim.category);
	expect(portNames(loaded.inputs)).toEqual(portNames(graphPrim.inputs));
	expect(portNames(loaded.outputs)).toEqual(portNames(graphPrim.outputs));
	expect(paramDefaults(loaded.params)).toEqual(paramDefaults(graphPrim.params));
	expect(loaded.wgsl!.entry).toBe(graphPrim.wgsl!.entry);
	expect(loaded.wgsl!.moduleId).toBe(graphPrim.wgsl!.moduleId);
}

const HARVEST_MODULES = [
	NOISE_VALUE2D_MODULE,
	NOISE_PERLIN2D_MODULE,
	NOISE_PERLIN2D_DERIV_MODULE,
	NOISE_WORLEY2D_MODULE,
	NOISE_VORONOI2D_MODULE,
	NOISE_BLUE2D_MODULE
] as const;

describe('noise-functions harvest WGSL modules', () => {
	for (const mod of HARVEST_MODULES) {
		it(`${mod.id}: loader contract matches graph registration`, () => {
			assertMechanicalParity(mod.id, mod.source);
		});

		it(`${mod.id}: declares noise.hash2d dependency matching @use`, () => {
			expect(mod.dependencies).toEqual(['noise.hash2d']);
			expect(mod.source).toMatch(/^\s*\/\/\s*@use\s+noise\.hash2d/m);
		});
	}

	it('noise.hash2d exposes shared hash helpers', () => {
		expect(NOISE_HASH2D_MODULE.source).toContain('fn hash12(');
		expect(NOISE_HASH2D_MODULE.source).toContain('fn hash22(');
		expect(NOISE_HASH2D_MODULE.source).toContain('fn hash32(');
		expect(NOISE_HASH2D_MODULE.source).toContain('noise-functions.glsl');
	});

	it('linked noise.value2d includes hash2d dependency closure', () => {
		const linked = textLinker.link({
			entry: 'noise.value2d',
			modules: {
				[NOISE_HASH2D_MODULE.id]: NOISE_HASH2D_MODULE.source,
				[NOISE_VALUE2D_MODULE.id]: NOISE_VALUE2D_MODULE.source
			}
		});
		expect(linked).toContain('fn hash12(');
		expect(linked).toContain('fn value2d(');
	});

	it('linked noise.perlin2dDeriv returns vec3f sample entry', () => {
		const linked = textLinker.link({
			entry: 'noise.perlin2dDeriv',
			modules: {
				[NOISE_HASH2D_MODULE.id]: NOISE_HASH2D_MODULE.source,
				[NOISE_PERLIN2D_DERIV_MODULE.id]: NOISE_PERLIN2D_DERIV_MODULE.source
			}
		});
		expect(linked).toContain('fn perlin2dDeriv(position: vec2<f32>) -> vec3<f32>');
	});

});
