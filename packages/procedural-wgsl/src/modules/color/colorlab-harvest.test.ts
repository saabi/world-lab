import { describe, expect, it } from 'vitest';
import {
	annotationsOf,
	fields,
	type TSchema
} from '@virtual-planet/schema';
import { getPrimitive, type PortSpec } from '@virtual-planet/graph';
import { loadWgslPrimitive, textLinker } from '@virtual-planet/compiler';
import '@virtual-planet/graph';

import {
	COLOR_COLORLAB_COMMON_MODULE,
	COLORLAB_HARVEST_MODULES
} from './colorlabHarvest.js';

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
	expect(loaded.wgsl.entry).toBe(graphPrim.wgsl.entry);
	expect(loaded.wgsl.moduleId).toBe(graphPrim.wgsl.moduleId);
	expect(loaded.metadata?.role).toBe('colorSpace');
	expect(loaded.metadata?.keywords).toEqual(['Effects', 'Colour']);
}

describe('colorlab harvest WGSL modules', () => {
	it('color.colorlabCommon exposes frozen matrices and transfer helpers', () => {
		expect(COLOR_COLORLAB_COMMON_MODULE.source).toContain('source: colorlab');
		expect(COLOR_COLORLAB_COMMON_MODULE.source).toContain('fn srgbEnc(');
		expect(COLOR_COLORLAB_COMMON_MODULE.source).toContain('fn scbrt(');
		expect(COLOR_COLORLAB_COMMON_MODULE.source).toContain('const OK_M1i:');
	});

	for (const mod of COLORLAB_HARVEST_MODULES) {
		it(`${mod.id}: loader contract matches graph registration`, () => {
			assertMechanicalParity(mod.id, mod.source);
			expect(mod.source).toContain('source: colorlab');
		});

		if ('dependencies' in mod && mod.dependencies) {
			it(`${mod.id}: declares color.colorlabCommon dependency matching @use`, () => {
				expect(mod.dependencies).toEqual(['color.colorlabCommon']);
				expect(mod.source).toMatch(/^\s*\/\/\s*@use\s+color\.colorlabCommon/m);
			});
		}
	}

	it('linked color.srgbToXyz includes colorlabCommon dependency closure', () => {
		const mod = COLORLAB_HARVEST_MODULES.find((entry) => entry.id === 'color.srgbToXyz')!;
		const linked = textLinker.link({
			entry: 'color.srgbToXyz',
			modules: {
				[COLOR_COLORLAB_COMMON_MODULE.id]: COLOR_COLORLAB_COMMON_MODULE.source,
				[mod.id]: mod.source
			}
		});
		expect(linked).toContain('fn srgbDec(');
		expect(linked).toContain('fn srgbToXyz(srgb: vec3<f32>) -> vec3<f32>');
	});

	it('color.oklabToOklch entry uses vec3<f32> and hue in degrees', () => {
		const mod = COLORLAB_HARVEST_MODULES.find((entry) => entry.id === 'color.oklabToOklch')!;
		expect(mod.source).toContain('fn oklabToOklch(oklab: vec3<f32>) -> vec3<f32>');
		expect(mod.source).toContain('degrees(atan2');
	});
});
