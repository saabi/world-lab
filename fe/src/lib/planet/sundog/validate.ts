import { CATALOG_SCHEMA_VERSION, type SunDogBody, type SunDogCatalog } from './catalogTypes.js';

// Catalog validator. Errors are correctness violations (duplicate/missing ids,
// missing provenance, a system without a star, non-positive orbit values);
// warnings flag soft data gaps (missing raw values, no starport). The committed
// catalog must produce zero errors (enforced by catalog.test.ts).
// See _docs/specs/sundog-legacy-solar-system-spec.md.

export interface CatalogIssue {
	level: 'error' | 'warning';
	message: string;
}

function isFiniteOrNull(v: number | null): boolean {
	return v === null || Number.isFinite(v);
}

/** Positive, or null (unknown). Zero/negative is an error for orbit magnitudes. */
function isPositiveOrNull(v: number | null): boolean {
	return v === null || (Number.isFinite(v) && v > 0);
}

function checkBody(
	body: SunDogBody,
	systemId: string,
	issues: CatalogIssue[]
): void {
	const where = `${systemId}/${body.id}`;
	if (!body.id) issues.push({ level: 'error', message: `Body in ${systemId} has no id` });
	if (!body.name) issues.push({ level: 'error', message: `Body ${where} has no name` });
	if (!body.provenance?.kind) {
		issues.push({ level: 'error', message: `Body ${where} missing provenance` });
	}
	const { orbit, gravityG, planetSizeRel } = body.render;
	if (!isPositiveOrNull(orbit.distanceToStarAu)) {
		issues.push({ level: 'error', message: `Body ${where} has non-positive orbit distance` });
	}
	if (!isPositiveOrNull(orbit.orbitPeriodDays)) {
		issues.push({ level: 'error', message: `Body ${where} has non-positive orbit period` });
	}
	if (!isPositiveOrNull(planetSizeRel)) {
		issues.push({ level: 'error', message: `Body ${where} has non-positive planet size` });
	}
	if (!isFiniteOrNull(gravityG)) {
		issues.push({ level: 'error', message: `Body ${where} has invalid gravity` });
	}
	if (orbit.distanceToStarAu === null) {
		issues.push({ level: 'warning', message: `Body ${where} missing orbit distance` });
	}
	if (!body.game.cities.some((c) => c.starport)) {
		issues.push({ level: 'warning', message: `Body ${where} has no starport city` });
	}
}

export function validateCatalog(catalog: SunDogCatalog): CatalogIssue[] {
	const issues: CatalogIssue[] = [];

	if (catalog.schemaVersion !== CATALOG_SCHEMA_VERSION) {
		issues.push({
			level: 'error',
			message: `Unexpected schemaVersion ${catalog.schemaVersion} (expected ${CATALOG_SCHEMA_VERSION})`
		});
	}
	if (!catalog.source?.kind) {
		issues.push({ level: 'error', message: 'Catalog missing dataset-level provenance' });
	}

	const systemIds = new Set<string>();
	const bodyIds = new Set<string>();

	for (const system of catalog.systems) {
		if (!system.id) {
			issues.push({ level: 'error', message: 'A system has no id' });
		} else if (systemIds.has(system.id)) {
			issues.push({ level: 'error', message: `Duplicate system id "${system.id}"` });
		} else {
			systemIds.add(system.id);
		}

		if (!system.provenance?.kind) {
			issues.push({ level: 'error', message: `System ${system.id} missing provenance` });
		}
		// Every system must have a (parent) star — planets reference it.
		if (!system.star?.starClass) {
			issues.push({ level: 'error', message: `System ${system.id} has no star` });
		}
		const pos = system.position;
		if (!pos || ![pos.x, pos.y, pos.z].every((n) => Number.isFinite(n))) {
			issues.push({ level: 'error', message: `System ${system.id} has invalid position` });
		}
		if (system.bodies.length === 0) {
			issues.push({ level: 'warning', message: `System ${system.id} has no planets` });
		}

		for (const body of system.bodies) {
			const key = `${system.id}/${body.id}`;
			if (bodyIds.has(key)) {
				issues.push({ level: 'error', message: `Duplicate body id "${key}"` });
			} else {
				bodyIds.add(key);
			}
			checkBody(body, system.id, issues);
		}
	}

	return issues;
}

export function catalogErrors(catalog: SunDogCatalog): CatalogIssue[] {
	return validateCatalog(catalog).filter((i) => i.level === 'error');
}
