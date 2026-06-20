import { describe, expect, it } from 'vitest';
import { annotationsOf, check, create } from '@virtual-planet/schema';
import {
	bodySchema,
	directionalLightSchema,
	editorForKind,
	inheritanceSchema,
	orbitSchema
} from './nodeSchemas.js';

describe('node schemas validate', () => {
	it('orbit: eccentricity is a real [0,1) constraint', () => {
		const ok = { ...create(orbitSchema), eccentricity: 0.4 };
		expect(check(orbitSchema, ok)).toBe(true);
		expect(check(orbitSchema, { ...ok, eccentricity: 44 })).toBe(false);
		// Units are introspectable for the form generator.
		expect(annotationsOf(orbitSchema.properties.semiMajorAxis).unit).toBe('km');
		expect(annotationsOf(orbitSchema.properties.periodSeconds).unit).toBe('s');
	});

	it('body: bodyType enum + radiusMeters (real node field, validated in metres)', () => {
		const body = create(bodySchema);
		expect(body.bodyType).toBe('planet'); // default
		expect(body.radiusMeters).toBe(500_000); // 500 km, stored in metres
		expect(check(bodySchema, { ...body, bodyType: 'moon' })).toBe(true);
		expect(check(bodySchema, { ...body, bodyType: 'comet' })).toBe(false);
		expect(check(bodySchema, { ...body, radiusMeters: 0 })).toBe(false); // below min
	});

	it('inheritance: per-channel paths default to the parent (../)', () => {
		expect(create(inheritanceSchema)).toEqual({ position: '../', rotation: '../', scale: '../' });
		// Any path string is valid (../, /, ../sibling, /sol/ferro …).
		expect(check(inheritanceSchema, { position: '../', rotation: '/', scale: '../' })).toBe(true);
		// Non-string is not a path.
		expect(check(inheritanceSchema, { position: 5, rotation: '../', scale: '../' })).toBe(false);
	});
});

describe('editorForKind (dispatch)', () => {
	it('routes bodies + lights to generated forms (no bespoke editors yet)', () => {
		const body = editorForKind('body');
		expect(body.mode).toBe('schema');
		if (body.mode === 'schema') expect(body.schema).toBe(bodySchema);

		const light = editorForKind('directional_light');
		expect(light.mode).toBe('schema');
		if (light.mode === 'schema') expect(light.schema).toBe(directionalLightSchema);

		// An unregistered kind falls back to the generic group form.
		expect(editorForKind('point_light').mode).toBe('schema');
	});
});
