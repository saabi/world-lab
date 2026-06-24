import type { Vec3 } from '../math/vec.js';
import type { SunDogSystem } from './catalogTypes.js';

// Deterministic galaxy-map layouts (pure). The default layout places systems at
// their real catalog coordinates (centered + scaled to scene metres). Shuffle
// re-lays them out on a seeded galactic disc — echoing the original SunDog, where
// system positions were randomized each new game. Same seed → same layout.
// See _docs/specs/sundog-legacy-solar-system-spec.md.

/** Scene metres per catalog coordinate unit (sets the map's overall scale). */
export const GALAXY_UNIT_M = 3e9;
/** Disc radius and half-thickness (scene metres) for the shuffled layout. */
const DISC_RADIUS_M = 7.5e10;
const DISC_HALF_THICKNESS_M = 1.2e10;

export type GalaxyLayout = Map<string, Vec3>;

/** Small fast deterministic PRNG (mulberry32) — stable across platforms. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** Layout from the real catalog coordinates, centered on the centroid and scaled. */
export function realLayout(systems: SunDogSystem[]): GalaxyLayout {
	const out: GalaxyLayout = new Map();
	if (systems.length === 0) return out;
	let cx = 0;
	let cy = 0;
	let cz = 0;
	for (const s of systems) {
		cx += s.position.x;
		cy += s.position.y;
		cz += s.position.z;
	}
	cx /= systems.length;
	cy /= systems.length;
	cz /= systems.length;
	for (const s of systems) {
		// Map catalog (x, y, z) → scene (x, z, y): the in-plane axes are the wide
		// galactic spread; the third becomes the (up) Y so the disc reads top-down.
		out.set(s.id, [
			(s.position.x - cx) * GALAXY_UNIT_M,
			(s.position.z - cz) * GALAXY_UNIT_M,
			(s.position.y - cy) * GALAXY_UNIT_M
		]);
	}
	return out;
}

/** Seeded re-layout on a galactic disc. Deterministic in `seed`. */
export function shuffledLayout(systems: SunDogSystem[], seed: number): GalaxyLayout {
	const rng = mulberry32(seed);
	const out: GalaxyLayout = new Map();
	for (const s of systems) {
		// sqrt() keeps the radial distribution roughly uniform across the disc area.
		const r = Math.sqrt(rng()) * DISC_RADIUS_M;
		const theta = rng() * Math.PI * 2;
		const y = (rng() - 0.5) * 2 * DISC_HALF_THICKNESS_M;
		out.set(s.id, [r * Math.cos(theta), y, r * Math.sin(theta)]);
	}
	return out;
}

export type LayoutMode = 'real' | 'shuffle';

/** Convenience dispatcher used by the galaxy map. */
export function galaxyLayout(
	systems: SunDogSystem[],
	mode: LayoutMode,
	seed = 1
): GalaxyLayout {
	return mode === 'shuffle' ? shuffledLayout(systems, seed) : realLayout(systems);
}
