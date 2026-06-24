/** Standard gamepad axis indices (W3C default mapping). */
export const GP_AXIS_LEFT_X = 0;
export const GP_AXIS_LEFT_Y = 1;
export const GP_AXIS_RIGHT_X = 2;
export const GP_AXIS_RIGHT_Y = 3;

/** Button indices for standard layout. */
export const GP_BTN_A = 0;
export const GP_BTN_B = 1;
export const GP_BTN_X = 2;
export const GP_BTN_L3 = 10;
export const GP_BTN_RT = 7;

export const DEFAULT_DEAD_ZONE = 0.12;

export interface GamepadAxes {
	leftX: number;
	leftY: number;
	rightX: number;
	rightY: number;
}

export interface GamepadButtons {
	l3Pressed: boolean;
	l3JustPressed: boolean;
	rtHeld: boolean;
}

export interface GamepadSnapshot {
	connected: boolean;
	id: string;
	axes: GamepadAxes;
	buttons: GamepadButtons;
}

export interface GamepadReaderState {
	preferredIndex: number;
	prevL3: boolean;
	lastInputTime: number;
}

export function createGamepadReaderState(): GamepadReaderState {
	return { preferredIndex: 0, prevL3: false, lastInputTime: 0 };
}

export function applyDeadZone(value: number, deadZone = DEFAULT_DEAD_ZONE): number {
	const abs = Math.abs(value);
	if (abs < deadZone) return 0;
	const sign = value < 0 ? -1 : 1;
	return sign * ((abs - deadZone) / (1 - deadZone));
}

function readPad(index: number): Gamepad | null {
	const pads = navigator.getGamepads?.();
	if (!pads) return null;
	return pads[index] ?? null;
}

/** Pick the first connected pad, preferring the last-used index. */
export function findActiveGamepad(preferredIndex: number): { pad: Gamepad; index: number } | null {
	const pads = navigator.getGamepads?.();
	if (!pads) return null;
	const preferred = pads[preferredIndex];
	if (preferred?.connected) return { pad: preferred, index: preferredIndex };
	for (let i = 0; i < pads.length; i++) {
		const p = pads[i];
		if (p?.connected) return { pad: p, index: i };
	}
	return null;
}

export function readGamepad(state: GamepadReaderState, deadZone = DEFAULT_DEAD_ZONE): GamepadSnapshot {
	const found = findActiveGamepad(state.preferredIndex);
	if (!found) {
		return {
			connected: false,
			id: '',
			axes: { leftX: 0, leftY: 0, rightX: 0, rightY: 0 },
			buttons: { l3Pressed: false, l3JustPressed: false, rtHeld: false }
		};
	}

	const { pad, index } = found;
	state.preferredIndex = index;

	const axes: GamepadAxes = {
		leftX: applyDeadZone(pad.axes[GP_AXIS_LEFT_X] ?? 0, deadZone),
		leftY: applyDeadZone(-(pad.axes[GP_AXIS_LEFT_Y] ?? 0), deadZone),
		rightX: applyDeadZone(pad.axes[GP_AXIS_RIGHT_X] ?? 0, deadZone),
		rightY: applyDeadZone(-(pad.axes[GP_AXIS_RIGHT_Y] ?? 0), deadZone)
	};

	const l3Pressed = !!pad.buttons[GP_BTN_L3]?.pressed;
	const l3JustPressed = l3Pressed && !state.prevL3;
	state.prevL3 = l3Pressed;

	const rtHeld = (pad.buttons[GP_BTN_RT]?.value ?? 0) > 0.5;

	const anyInput =
		Math.abs(axes.leftX) > 0 ||
		Math.abs(axes.leftY) > 0 ||
		Math.abs(axes.rightX) > 0 ||
		Math.abs(axes.rightY) > 0 ||
		l3Pressed ||
		rtHeld;
	if (anyInput) state.lastInputTime = performance.now();

	return {
		connected: true,
		id: pad.id,
		axes,
		buttons: { l3Pressed, l3JustPressed, rtHeld }
	};
}

/** @internal test helper */
export function _readPadAt(index: number): Gamepad | null {
	return readPad(index);
}
