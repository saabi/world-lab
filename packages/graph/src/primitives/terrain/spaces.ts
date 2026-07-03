import type { SpaceId } from '../../types.js';

/** Coordinate spaces owned by the planet/terrain standard library. */
export const PLANET_SPACES = {
	BODY_DIRECTION: 'body_dir',
	BODY_POSITION: 'body_pos',
	WORLD_DIRECTION: 'world_dir',
	WORLD_POSITION: 'world_pos',
	IDEAL_FRAGMENT_BODY_DIRECTION: 'ideal_fragment_body_dir',
	HEIGHT_METERS: 'height_meters',
	WORLD_RADIUS_METERS: 'world_radius_meters',
	SCALE_CONTEXT: 'scale_ctx'
} as const satisfies Record<string, SpaceId>;
