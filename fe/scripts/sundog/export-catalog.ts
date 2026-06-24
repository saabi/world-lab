// Export the SunDog catalog from a local SunDog: Resurrection sundog.db into the
// committed, renderer-agnostic JSON the app consumes. Reverse engineering is not
// needed — the DB is clean relational data. Only this DERIVED JSON is committed
// (with Bruce Webster's approval); the Resurrection distribution / DB are never
// committed.
//
// Usage (from fe/):
//   npm run sundog:export                 # uses $SUNDOG_DB or the default path
//   SUNDOG_DB=/path/to/sundog.db npm run sundog:export
//   node --experimental-strip-types scripts/sundog/export-catalog.ts [dbPath]
//
// See _docs/specs/sundog-legacy-solar-system-spec.md.

import { DatabaseSync } from 'node:sqlite';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type {
	SunDogBody,
	SunDogCatalog,
	SunDogCity,
	SunDogSystem
} from '../../src/lib/planet/sundog/catalogTypes.ts';

const DEFAULT_DB =
	'/mnt/f/Downloads/fun/Sundog Resurrection Beta 3.6 - 14 Dec 2018/Sundog Resurrection/databases/sundog.db';
const SOURCE = 'SunDog: Resurrection (Beta 3.6, 14 Dec 2018) sundog.db';

const dbPath = process.argv[2] ?? process.env.SUNDOG_DB ?? DEFAULT_DB;
const outPath = join(import.meta.dirname, '../../src/lib/planet/sundog/sundog-catalog.json');
const extractedAt = new Date().toISOString();

function slug(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/['’]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function num(v: unknown): number | null {
	return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function str(v: unknown): string | null {
	return typeof v === 'string' && v.length > 0 ? v : null;
}

/** SunDog stores habitable as -1/0/1; 0 = not habitable, anything else habitable. */
function habitable(v: unknown): boolean | null {
	if (typeof v !== 'number') return null;
	return v !== 0;
}

interface SystemRow {
	_id: number;
	name: string;
	x: number;
	y: number;
	z: number;
	planets: number;
	mass: number;
	starclass: string;
	temperature: number;
	radius: number;
	luminosity: number;
	priceModifier: number;
	systemCode: string;
	pirateActivity: number;
}

interface PlanetRow {
	_id: number;
	name: string;
	wealth: number;
	temperature: number;
	moisture: number;
	fertility: number;
	naturalIndustry: number;
	techIndustry: number;
	population: number;
	settlementAge: number;
	trade: number;
	instability: number;
	gunShop: number;
	costOfLiving: number;
	blackMarket: number;
	dayRotation: number;
	orbitPeriod: number;
	moons: number;
	distanceToStar: number;
	terrain: string;
	gravity: number;
	planetSize: number;
	habitable: number;
	notes: string;
	mapType: string;
}

interface CityRow {
	_id: number;
	name: string;
	starport: number;
	crime: number;
}

const db = new DatabaseSync(dbPath, { readOnly: true });

const systemRows = db.prepare('SELECT * FROM systemTable ORDER BY _id').all() as unknown as SystemRow[];
const planetsForSystem = db.prepare(
	`SELECT p.* FROM systemPlanet sp JOIN planetTable p ON p._id = sp.planet
	 WHERE sp.system = ? ORDER BY p.distanceToStar, p._id`
);
const citiesForPlanet = db.prepare(
	`SELECT c._id, c.name, c.starport, c.crime FROM planetCity pc JOIN cityTable c ON c._id = pc.city
	 WHERE pc.planet = ? ORDER BY c.starport DESC, c.name`
);
const planetIdByRow = db.prepare(
	`SELECT sp.planet AS planet FROM systemPlanet sp JOIN planetTable p ON p._id = sp.planet
	 WHERE sp.system = ? ORDER BY p.distanceToStar, p._id`
);

function buildCities(planetId: number): SunDogCity[] {
	const rows = citiesForPlanet.all(planetId) as unknown as CityRow[];
	return rows.map((c) => ({
		id: slug(c.name),
		name: c.name,
		starport: c.starport === 1,
		crime: num(c.crime)
	}));
}

function buildBody(p: PlanetRow, planetId: number): SunDogBody {
	return {
		id: slug(p.name),
		name: p.name,
		kind: 'planet',
		render: {
			terrain: str(p.terrain),
			orbit: {
				distanceToStarAu: num(p.distanceToStar),
				orbitPeriodDays: num(p.orbitPeriod),
				dayRotationHours: num(p.dayRotation)
			},
			gravityG: num(p.gravity),
			planetSizeRel: num(p.planetSize),
			moons: num(p.moons),
			habitable: habitable(p.habitable)
		},
		game: {
			wealth: num(p.wealth),
			temperature: num(p.temperature),
			moisture: num(p.moisture),
			fertility: num(p.fertility),
			naturalIndustry: num(p.naturalIndustry),
			techIndustry: num(p.techIndustry),
			population: num(p.population),
			settlementAge: num(p.settlementAge),
			trade: num(p.trade),
			instability: num(p.instability),
			gunShop: num(p.gunShop),
			costOfLiving: num(p.costOfLiving),
			blackMarket: num(p.blackMarket),
			notes: str(p.notes),
			cities: buildCities(planetId)
		},
		provenance: { kind: 'extracted', source: SOURCE, extractedAt }
	};
}

const systems: SunDogSystem[] = systemRows.map((s) => {
	const planetRows = planetsForSystem.all(s._id) as unknown as PlanetRow[];
	const planetIds = (planetIdByRow.all(s._id) as unknown as { planet: number }[]).map((r) => r.planet);
	const bodies = planetRows.map((p, i) => buildBody(p, planetIds[i] ?? p._id));
	return {
		id: slug(s.name),
		code: s.systemCode,
		name: s.name,
		position: { x: s.x, y: s.y, z: s.z },
		star: {
			starClass: s.starclass,
			temperatureK: num(s.temperature),
			radiusSolar: num(s.radius),
			luminositySolar: num(s.luminosity),
			massSolar: num(s.mass)
		},
		bodies,
		game: {
			priceModifier: num(s.priceModifier),
			pirateActivity: num(s.pirateActivity),
			planetCount: bodies.length
		},
		provenance: { kind: 'extracted', source: SOURCE, extractedAt }
	};
});

const catalog: SunDogCatalog = {
	schemaVersion: 1,
	source: {
		kind: 'extracted',
		source: SOURCE,
		extractedAt,
		notes:
			'Real SunDog: Frozen Legacy data, used with Bruce Webster (original author) approval. Derived data only; the Resurrection distribution is not redistributed.'
	},
	systems
};

db.close();
writeFileSync(outPath, JSON.stringify(catalog, null, '\t') + '\n');
console.log(
	`Wrote ${systems.length} systems / ${systems.reduce((n, s) => n + s.bodies.length, 0)} planets -> ${outPath}`
);
