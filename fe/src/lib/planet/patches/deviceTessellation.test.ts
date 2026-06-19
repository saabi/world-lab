import { describe, expect, it } from 'vitest';
import {
	coerceTessellation,
	decideTessellation,
	parseStored
} from './deviceTessellation.js';
import {
	DEFAULT_TESSELLATION,
	MOBILE_TESSELLATION,
	type TessellationSettings
} from './tessellationSettings.js';

const VALID: TessellationSettings = {
	detail: 0.5,
	vertexBudgetMillions: 2,
	maxPatchResolution: 16,
	maxDepth: 4
};

describe('coerceTessellation', () => {
	it('accepts a well-formed settings object', () => {
		expect(coerceTessellation(VALID)).toEqual(VALID);
	});

	it('rejects non-objects and missing/invalid fields', () => {
		expect(coerceTessellation(null)).toBeNull();
		expect(coerceTessellation('x')).toBeNull();
		expect(coerceTessellation({ ...VALID, detail: 0 })).toBeNull(); // non-positive
		expect(coerceTessellation({ ...VALID, vertexBudgetMillions: 'big' })).toBeNull();
		expect(coerceTessellation({ ...VALID, maxPatchResolution: 48 })).toBeNull(); // not a level
		expect(coerceTessellation({ ...VALID, maxDepth: 2 })).toBeNull(); // not allowed
	});

	it('accepts the auto sentinels (0)', () => {
		expect(coerceTessellation(DEFAULT_TESSELLATION)).toEqual(DEFAULT_TESSELLATION);
	});
});

describe('parseStored', () => {
	it('returns null for empty / malformed / wrong-status input', () => {
		expect(parseStored(null)).toBeNull();
		expect(parseStored('')).toBeNull();
		expect(parseStored('{not json')).toBeNull();
		expect(parseStored(JSON.stringify({ status: 'bogus', settings: VALID }))).toBeNull();
		expect(parseStored(JSON.stringify({ status: 'committed', settings: { detail: -1 } }))).toBeNull();
	});

	it('parses valid committed / attempting records', () => {
		expect(parseStored(JSON.stringify({ status: 'committed', settings: VALID }))).toEqual({
			status: 'committed',
			settings: VALID
		});
		expect(parseStored(JSON.stringify({ status: 'attempting', settings: VALID }))).toEqual({
			status: 'attempting',
			settings: VALID
		});
	});
});

describe('decideTessellation (boot sentinel)', () => {
	it('trusts a committed record', () => {
		expect(decideTessellation({ status: 'committed', settings: VALID }, DEFAULT_TESSELLATION)).toEqual(
			{ settings: VALID, fellBack: false }
		);
	});

	it('falls back to the floor on an uncommitted attempt (last session crashed)', () => {
		const out = decideTessellation({ status: 'attempting', settings: VALID }, DEFAULT_TESSELLATION);
		expect(out).toEqual({ settings: MOBILE_TESSELLATION, fellBack: true });
	});

	it('uses the device default when there is no record (first visit)', () => {
		expect(decideTessellation(null, DEFAULT_TESSELLATION)).toEqual({
			settings: DEFAULT_TESSELLATION,
			fellBack: false
		});
		expect(decideTessellation(null, MOBILE_TESSELLATION)).toEqual({
			settings: MOBILE_TESSELLATION,
			fellBack: false
		});
	});
});
