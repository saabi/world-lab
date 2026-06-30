import { describe, expect, it } from 'vitest';
import { inputHandleId, outputHandleId, portIdFromHandle } from './portHandles.js';

describe('portHandles', () => {
	it('round-trips input and output handle ids separately', () => {
		expect(portIdFromHandle(inputHandleId('value'))).toBe('value');
		expect(portIdFromHandle(outputHandleId('value'))).toBe('value');
		expect(inputHandleId('value')).not.toBe(outputHandleId('value'));
	});
});
