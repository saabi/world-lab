import catalogJson from './sundog-catalog.json';
import type { SunDogCatalog, SunDogSystem } from './catalogTypes.js';

// Typed loader over the committed, extracted catalog JSON. The JSON is generated
// by scripts/sundog/export-catalog.ts from SunDog: Resurrection's sundog.db.
// See _docs/specs/sundog-legacy-solar-system-spec.md.

const catalog = catalogJson as unknown as SunDogCatalog;

export function getCatalog(): SunDogCatalog {
	return catalog;
}

export function listSystems(): SunDogSystem[] {
	return catalog.systems;
}

export function getSystem(id: string): SunDogSystem | undefined {
	return catalog.systems.find((s) => s.id === id);
}
