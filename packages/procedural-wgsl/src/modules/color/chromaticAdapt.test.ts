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
	COLOR_CHROMATIC_ADAPT_MODULE,
	COLOR_COLORLAB_COMMON_MODULE
} from './index.js';

function portNames(ports: PortSpec[]): string[] {
	return ports.map((port) => port.name);
}

function paramDefaults(schema: TSchema): Record<string, unknown> {
	return Object.fromEntries(
		fields(schema).map((field) => [field.key, annotationsOf(field.schema).default])
	);
}

describe('color.chromaticAdapt WGSL module', () => {
	it('loader contract matches graph registration (no colorSpace role)', () => {
		const graphPrim = getPrimitive('color.chromaticAdapt')!;
		const loaded = loadWgslPrimitive({
			moduleId: COLOR_CHROMATIC_ADAPT_MODULE.id,
			source: COLOR_CHROMATIC_ADAPT_MODULE.source
		}).primitive;

		expect(loaded.id).toBe(graphPrim.id);
		expect(loaded.category).toBe(graphPrim.category);
		expect(portNames(loaded.inputs)).toEqual(portNames(graphPrim.inputs));
		expect(portNames(loaded.outputs)).toEqual(portNames(graphPrim.outputs));
		expect(paramDefaults(loaded.params)).toEqual(paramDefaults(graphPrim.params));
		expect(loaded.wgsl.entry).toBe(graphPrim.wgsl.entry);
		expect(loaded.wgsl.moduleId).toBe(graphPrim.wgsl.moduleId);
		expect(loaded.metadata?.role).toBeUndefined();
		expect(loaded.metadata?.keywords).toEqual(['Effects', 'Colour']);
		expect(COLOR_CHROMATIC_ADAPT_MODULE.source).toContain('source: colorlab');
	});

	it('declares color.colorlabCommon dependency and links cleanly', () => {
		expect(COLOR_CHROMATIC_ADAPT_MODULE.dependencies).toEqual(['color.colorlabCommon']);
		expect(COLOR_CHROMATIC_ADAPT_MODULE.source).toMatch(/^\s*\/\/\s*@use\s+color\.colorlabCommon/m);

		const linked = textLinker.link({
			entry: 'color.chromaticAdapt',
			modules: {
				[COLOR_COLORLAB_COMMON_MODULE.id]: COLOR_COLORLAB_COMMON_MODULE.source,
				[COLOR_CHROMATIC_ADAPT_MODULE.id]: COLOR_CHROMATIC_ADAPT_MODULE.source
			}
		});
		expect(linked).toContain('fn mulMat3Vec3(');
		expect(linked).toContain('fn chromaticAdapt(xyz: vec3<f32>, srcWhite: vec3<f32>, dstWhite: vec3<f32>)');
	});
});
