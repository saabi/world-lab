import { describe, expect, it } from 'vitest';
import { applyDeadZone } from './gamepad.js';
import {
	createFlightInputState,
	pollFlightInput,
	toggleRcsMode,
	type FlightKeyboardState
} from './controls.js';

describe('applyDeadZone', () => {
	it('zeros small values', () => {
		expect(applyDeadZone(0.05)).toBe(0);
	});
	it('rescales past dead zone', () => {
		expect(applyDeadZone(1)).toBeCloseTo(1, 2);
	});
});

describe('pollFlightInput', () => {
	const kb = (partial: Partial<FlightKeyboardState>): FlightKeyboardState => ({
		w: false,
		a: false,
		s: false,
		d: false,
		q: false,
		e: false,
		space: false,
		control: false,
		shift: false,
		...partial
	});

	it('translate mode maps WASD to thrust only', () => {
		const state = createFlightInputState('translate');
		state.keyboard = kb({ w: true, d: true });
		const input = pollFlightInput(state);
		expect(input.rcsMode).toBe('translate');
		expect(input.translate).toEqual([1, 0, 1]);
		expect(input.rotate).toEqual([0, 0, 0]);
	});

	it('rotate mode remaps WASD to torque', () => {
		const state = createFlightInputState('rotate');
		state.keyboard = kb({ w: true, a: true, q: true });
		const input = pollFlightInput(state);
		expect(input.rotate).toEqual([-1, 1, -1]);
		expect(input.translate).toEqual([0, 0, 0]);
	});

	it('toggleRcsMode flips mode on edge', () => {
		const state = createFlightInputState('translate');
		state.toggleRcsModePressed = true;
		const input = pollFlightInput(state);
		expect(input.rcsMode).toBe('rotate');
		expect(state.rcsMode).toBe('rotate');
	});

	it('toggleRcsMode helper', () => {
		expect(toggleRcsMode('translate')).toBe('rotate');
		expect(toggleRcsMode('rotate')).toBe('translate');
	});
});
