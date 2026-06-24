import type { Vec3 } from '../math/vec.js';
import { type GamepadReaderState, readGamepad } from './gamepad.js';
import type { FlightInput, RcsAxisMode } from './types.js';

export interface FlightKeyboardState {
	w: boolean;
	a: boolean;
	s: boolean;
	d: boolean;
	q: boolean;
	e: boolean;
	space: boolean;
	control: boolean;
	shift: boolean;
}

export const EMPTY_FLIGHT_KEYBOARD: FlightKeyboardState = {
	w: false,
	a: false,
	s: false,
	d: false,
	q: false,
	e: false,
	space: false,
	control: false,
	shift: false
};

export interface FlightInputState {
	keyboard: FlightKeyboardState;
	gamepad: GamepadReaderState;
	rcsMode: RcsAxisMode;
	toggleRcsModePressed: boolean;
	pointerLook?: { dx: number; dy: number };
}

export function createFlightInputState(rcsMode: RcsAxisMode = 'translate'): FlightInputState {
	return {
		keyboard: { ...EMPTY_FLIGHT_KEYBOARD },
		gamepad: { preferredIndex: 0, prevL3: false, lastInputTime: 0 },
		rcsMode,
		toggleRcsModePressed: false
	};
}

function axisFromDigital(neg: boolean, pos: boolean): number {
	if (neg && pos) return 0;
	if (pos) return 1;
	if (neg) return -1;
	return 0;
}

function mergeAxis(digital: number, analog: number): number {
	if (Math.abs(analog) > Math.abs(digital)) return analog;
	return digital !== 0 ? digital : analog;
}

/** Map keyboard WASD cluster for the active RCS mode. */
function keyboardAxes(
	kb: FlightKeyboardState,
	mode: RcsAxisMode
): { x: number; y: number; z: number } {
	if (mode === 'translate') {
		return {
			x: axisFromDigital(kb.a, kb.d),
			y: axisFromDigital(kb.control, kb.space),
			z: axisFromDigital(kb.s, kb.w)
		};
	}
	return {
		x: axisFromDigital(kb.a, kb.d),
		y: axisFromDigital(kb.s, kb.w),
		z: axisFromDigital(kb.q, kb.e)
	};
}

/** Map gamepad sticks for the active RCS mode (4 analog axes → 3 DoF). */
function gamepadAxes(
	pad: ReturnType<typeof readGamepad>,
	mode: RcsAxisMode
): { x: number; y: number; z: number } {
	if (mode === 'translate') {
		return { x: pad.axes.leftX, y: pad.axes.rightY, z: pad.axes.leftY };
	}
	return { x: pad.axes.leftX, y: pad.axes.leftY, z: pad.axes.rightX };
}

export function toggleRcsMode(mode: RcsAxisMode): RcsAxisMode {
	return mode === 'translate' ? 'rotate' : 'translate';
}

/**
 * Build normalized flight commands for the current frame.
 * Only the active RCS mode channel is non-zero (plus optional pointer look).
 */
export function pollFlightInput(state: FlightInputState): FlightInput {
	let rcsMode = state.rcsMode;
	if (state.toggleRcsModePressed) {
		rcsMode = toggleRcsMode(rcsMode);
		state.rcsMode = rcsMode;
		state.toggleRcsModePressed = false;
	}

	const pad = readGamepad(state.gamepad);
	if (pad.buttons.l3JustPressed) {
		rcsMode = toggleRcsMode(rcsMode);
		state.rcsMode = rcsMode;
	}

	const kb = keyboardAxes(state.keyboard, rcsMode);
	const gp = gamepadAxes(pad, rcsMode);

	const x = mergeAxis(kb.x, gp.x);
	const y = mergeAxis(kb.y, gp.y);
	const z = mergeAxis(kb.z, gp.z);

	const boost = state.keyboard.shift || pad.buttons.rtHeld;

	const zero: Vec3 = [0, 0, 0];
	let translate: Vec3 = zero;
	let rotate: Vec3 = zero;

	if (rcsMode === 'translate') {
		translate = [x, y, z];
	} else {
		rotate = [x, y, z];
	}

	return {
		translate,
		rotate,
		rcsMode,
		boost,
		pointerLook: state.pointerLook
	};
}

export function flightInputActive(input: FlightInput): boolean {
	const t = input.translate;
	const r = input.rotate;
	return (
		t[0] !== 0 ||
		t[1] !== 0 ||
		t[2] !== 0 ||
		r[0] !== 0 ||
		r[1] !== 0 ||
		r[2] !== 0 ||
		!!input.pointerLook
	);
}
