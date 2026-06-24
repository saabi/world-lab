import { describe, expect, it } from 'vitest';
import { getCatalog, getSystem, listSystems } from './catalog.js';
import { catalogErrors, validateCatalog } from './validate.js';
import { CATALOG_SCHEMA_VERSION } from './catalogTypes.js';

describe('sundog catalog', () => {
	it('loads and validates with no errors', () => {
		const errors = catalogErrors(getCatalog());
		expect(errors, JSON.stringify(errors, null, 2)).toEqual([]);
	});

	it('has the expected schema version and dataset provenance', () => {
		const catalog = getCatalog();
		expect(catalog.schemaVersion).toBe(CATALOG_SCHEMA_VERSION);
		expect(catalog.source.kind).toBe('extracted');
	});

	it('contains the 12 known SunDog systems including Jondd', () => {
		const systems = listSystems();
		expect(systems).toHaveLength(12);
		const jondd = getSystem('jondd');
		expect(jondd?.name).toBe('Jondd');
		expect(jondd?.code).toBe('JD');
		expect(jondd?.star.starClass).toBe('G2');
	});

	it('has unique system ids and unique body ids within each system', () => {
		const systems = listSystems();
		const sysIds = systems.map((s) => s.id);
		expect(new Set(sysIds).size).toBe(sysIds.length);
		for (const s of systems) {
			const ids = s.bodies.map((b) => b.id);
			expect(new Set(ids).size, `dupe body id in ${s.id}`).toBe(ids.length);
		}
	});

	it('gives every system a parent star and real galaxy coordinates', () => {
		for (const s of listSystems()) {
			expect(s.star.starClass, s.id).toBeTruthy();
			for (const v of [s.position.x, s.position.y, s.position.z]) {
				expect(Number.isFinite(v)).toBe(true);
			}
		}
	});

	it('separates render and game params and tags every body with provenance', () => {
		const jondd = getSystem('jondd');
		const homeworld = jondd?.bodies.find((b) => b.id === 'jondd');
		expect(homeworld?.render.terrain).toBe('Terran');
		expect(homeworld?.render.orbit.orbitPeriodDays).toBe(306);
		expect(homeworld?.game.wealth).toBe(6);
		expect(homeworld?.game.cities.some((c) => c.starport && c.name === 'Drahew')).toBe(true);
		for (const s of listSystems()) {
			for (const b of s.bodies) {
				expect(b.provenance.kind, `${s.id}/${b.id}`).toBe('extracted');
			}
		}
	});

	it('represents unknowns as null, never NaN', () => {
		const json = JSON.stringify(getCatalog());
		expect(json.includes('NaN')).toBe(false);
	});

	it('validateCatalog flags duplicate system ids as an error', () => {
		const catalog = getCatalog();
		const broken = { ...catalog, systems: [...catalog.systems, catalog.systems[0]!] };
		const errors = validateCatalog(broken).filter((i) => i.level === 'error');
		expect(errors.some((e) => /Duplicate system id/.test(e.message))).toBe(true);
	});
});
