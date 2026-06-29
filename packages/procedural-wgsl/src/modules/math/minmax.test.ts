import { describe, expect, it } from 'vitest';

import { MATH_MIN_MODULE, MATH_MIN_SOURCE } from './min.js';
import { MATH_MAX_MODULE, MATH_MAX_SOURCE } from './max.js';

describe('math.min/max WGSL entry names', () => {
	it('math.min declares mathMin, not fn min', () => {
		expect(MATH_MIN_MODULE.id).toBe('math.min');
		expect(MATH_MIN_SOURCE).toContain('fn mathMin(');
		expect(MATH_MIN_SOURCE).not.toMatch(/\bfn min\s*\(/);
	});

	it('math.max declares mathMax, not fn max', () => {
		expect(MATH_MAX_MODULE.id).toBe('math.max');
		expect(MATH_MAX_SOURCE).toContain('fn mathMax(');
		expect(MATH_MAX_SOURCE).not.toMatch(/\bfn max\s*\(/);
	});
});
