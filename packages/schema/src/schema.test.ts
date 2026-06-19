import { describe, expect, it } from 'vitest';
import {
	annotationsOf,
	check,
	extent,
	quantity,
	ref,
	withDefault,
	type Static
} from './schema.js';

describe('quantity', () => {
	it('annotates unit + extent + default on a validatable number schema', () => {
		const radius = quantity('km', { min: 1, max: 100_000, default: 500 });
		const ann = annotationsOf(radius);
		expect(ann.unit).toBe('km');
		expect(ann.extent).toEqual([1, 100_000]);
		expect(ann.default).toBe(500);
		// The extent is a real constraint, not just a hint.
		expect(check(radius, 500)).toBe(true);
		expect(check(radius, 0)).toBe(false); // below min
		expect(check(radius, 'x')).toBe(false); // not a number
	});

	it('validates the eccentricity case (dimensionless, [0,1))', () => {
		const eccentricity = quantity('none', { min: 0, max: 1, default: 0 });
		expect(check(eccentricity, 0.5)).toBe(true);
		expect(check(eccentricity, 44)).toBe(false); // the running example — caught at runtime
	});

	it('integer:true rejects fractionals', () => {
		const res = quantity('none', { integer: true, min: 8 });
		expect(check(res, 16)).toBe(true);
		expect(check(res, 16.5)).toBe(false);
	});

	it('infers a number static type', () => {
		const q = quantity('kg', { default: 1 });
		const v: Static<typeof q> = 5; // compile-time assertion
		expect(typeof v).toBe('number');
	});
});

describe('extent', () => {
	it('constrains a dimensionless range', () => {
		const fraction = extent(0, 1);
		expect(check(fraction, 0.5)).toBe(true);
		expect(check(fraction, 2)).toBe(false);
		expect(annotationsOf(fraction).extent).toEqual([0, 1]);
	});
});

describe('ref', () => {
	it('is a path string schema annotated x-ref, defaulting to the path', () => {
		const driver = ref('/methods/orbit');
		const ann = annotationsOf(driver);
		expect(ann.ref).toBe(true);
		expect(ann.default).toBe('/methods/orbit');
		expect(check(driver, '../')).toBe(true); // any path string
		expect(check(driver, 42)).toBe(false);
	});
});

describe('withDefault', () => {
	it('stamps a default without mutating the original (curried)', () => {
		const base = quantity('km', { min: 1 });
		const with500 = withDefault(base)(500);
		expect(annotationsOf(with500).default).toBe(500);
		expect(annotationsOf(base).default).toBeUndefined(); // original untouched
	});
});

describe('serializability (plain data)', () => {
	it('serializes to JSON-Schema data: annotations + constraints survive the round-trip', () => {
		const radius = quantity('km', { min: 1, max: 9, default: 5, widget: 'slider' });
		const roundTripped = JSON.parse(JSON.stringify(radius));
		// Domain annotations survive — they still drive the form generator after a load.
		expect(annotationsOf(roundTripped)).toMatchObject({
			unit: 'km',
			extent: [1, 9],
			default: 5,
			widget: 'slider'
		});
		// The JSON-Schema constraints survive too (a JSON-Schema validator can use them).
		expect(roundTripped.type).toBe('number');
		expect(roundTripped.minimum).toBe(1);
		expect(roundTripped.maximum).toBe(9);
	});

	it('check() validates the live (in-memory) schema', () => {
		// TypeBox's checker needs the in-memory Kind symbol that JSON drops, so a
		// deserialized schema must be re-hydrated or validated via ajv — see check().
		const radius = quantity('km', { min: 1, max: 9 });
		expect(check(radius, 5)).toBe(true);
		expect(check(radius, 50)).toBe(false);
	});
});
