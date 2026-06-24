// SunDog catalog — the normalized, renderer-agnostic data layer for SunDog:
// Frozen Legacy star systems. Extracted from SunDog: Resurrection's sundog.db
// (see scripts/sundog/export-catalog.ts) with Bruce Webster's approval. Each
// body separates RENDER params (drive the procedural planet) from GAME params
// (economy/lore, preserved for a future remake). Unknown values are `null`,
// never guessed; provenance records where each record came from.
// See _docs/specs/sundog-legacy-solar-system-spec.md.

export const CATALOG_SCHEMA_VERSION = 1;

export type ProvenanceKind = 'extracted' | 'observed' | 'authored' | 'estimated';

export interface Provenance {
	kind: ProvenanceKind;
	/** Human-readable source, e.g. "SunDog: Resurrection (Beta 3.6) sundog.db". */
	source: string;
	/** ISO timestamp of extraction, when applicable. */
	extractedAt?: string;
	notes?: string;
}

export interface SunDogCatalog {
	schemaVersion: typeof CATALOG_SCHEMA_VERSION;
	/** Dataset-level provenance + permission note. */
	source: Provenance;
	systems: SunDogSystem[];
}

export interface SunDogSystem {
	/** Stable slug id (e.g. "jondd"). */
	id: string;
	/** Two-letter system code from the source (e.g. "JD"). */
	code: string;
	name: string;
	/** Real galaxy coordinates — the map's canonical default layout. */
	position: { x: number; y: number; z: number };
	star: SunDogStar;
	bodies: SunDogBody[];
	game: SunDogSystemGame;
	provenance: Provenance;
}

export interface SunDogStar {
	/** Spectral class, e.g. "G2". */
	starClass: string;
	temperatureK: number | null;
	radiusSolar: number | null;
	luminositySolar: number | null;
	massSolar: number | null;
}

export interface SunDogSystemGame {
	priceModifier: number | null;
	pirateActivity: number | null;
	planetCount: number | null;
}

export interface SunDogBody {
	/** Stable slug id (unique within the catalog). */
	id: string;
	name: string;
	kind: 'planet' | 'moon';
	render: SunDogBodyRender;
	game: SunDogBodyGame;
	provenance: Provenance;
}

export interface SunDogBodyRender {
	/** SunDog terrain class verbatim (Terran/Jungle/Desert/Ice/Regolith); the
	 *  scene builder maps it to a procedural preset via terrainToPreset. */
	terrain: string | null;
	orbit: {
		distanceToStarAu: number | null;
		orbitPeriodDays: number | null;
		dayRotationHours: number | null;
	};
	gravityG: number | null;
	/** Planet size relative to Earth (≈ Earth radii). */
	planetSizeRel: number | null;
	moons: number | null;
	habitable: boolean | null;
}

export interface SunDogBodyGame {
	wealth: number | null;
	temperature: number | null;
	moisture: number | null;
	fertility: number | null;
	naturalIndustry: number | null;
	techIndustry: number | null;
	population: number | null;
	settlementAge: number | null;
	trade: number | null;
	instability: number | null;
	gunShop: number | null;
	costOfLiving: number | null;
	blackMarket: number | null;
	notes: string | null;
	cities: SunDogCity[];
}

export interface SunDogCity {
	id: string;
	name: string;
	starport: boolean;
	crime: number | null;
}
