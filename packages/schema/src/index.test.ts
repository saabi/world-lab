import { describe, expect, it } from 'vitest';
import { SCHEMA_PACKAGE } from './index.js';

describe('@virtual-planet/schema scaffold', () => {
	it('exports its package identity', () => {
		expect(SCHEMA_PACKAGE).toBe('@virtual-planet/schema');
	});
});
