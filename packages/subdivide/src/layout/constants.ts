/** Bump when persisted layout JSON shape changes incompatibly. */
export const LAYOUT_DOCUMENT_VERSION = 2;

export const NORTH = 'NORTH' as const;
export const SOUTH = 'SOUTH' as const;
export const EAST = 'EAST' as const;
export const WEST = 'WEST' as const;

export const IS_MAC =
	typeof navigator === 'undefined' ? false : navigator.platform === 'MacIntel';

export function isModifierPressed(event: KeyboardEvent | MouseEvent): boolean {
	return IS_MAC ? event.metaKey : event.ctrlKey;
}

/** Minimum fractional pane size after split (prevents instant merge on mouseup). */
export const MIN_PANE_FRACTION = 0.05;
