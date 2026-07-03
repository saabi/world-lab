import type { Snippet } from 'svelte';

export type FloatingPanelSide = 'left' | 'right' | 'top' | 'bottom';

/**
 * A panel that overlays whichever pane currently hosts `zone`, docked to one edge of that
 * pane — independent of the divider tree (it reserves no grid space; the pane keeps its full
 * size whether the panel is open or closed). Tracks the zone, not a fixed pane: if the user
 * reassigns which pane shows `zone` (or splits it into more than one), the panel follows.
 * Blender's `N`-key sidebar is the reference behavior.
 */
export interface FloatingPanelSpec {
	id: string;
	/** Which zone's pane(s) this panel overlays — matches a key in the hosting `ZoneMap`. */
	zone: string;
	side: FloatingPanelSide;
	open: boolean;
	/** CSS length along the docking axis: width for left/right, height for top/bottom. */
	size?: string;
	/**
	 * Fill the cross axis (full pane height for left/right, full pane width for top/bottom)
	 * instead of sizing to content. Default `false` — like Blender's own panels, a floating
	 * panel anchors to a corner and grows with its content (capped and internally scrollable
	 * at the pane's available size), rather than always spanning the whole edge.
	 */
	stretch?: boolean;
	snippet: Snippet<[]>;
}
