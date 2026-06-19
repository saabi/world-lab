import type { TessellationSettings } from './tessellationSettings.js';
import { MOBILE_TESSELLATION } from './tessellationSettings.js';

// Device-scoped persistence + boot sentinel for the tessellation preference.
// Tessellation is a per-device property, so it lives in localStorage (not the
// planet document). The sentinel makes a possibly-too-heavy value safe to persist:
// we record "attempting" before the first heavy render and flip to "committed"
// only once the app survives a grace period. On load, an uncommitted "attempting"
// record means the last session crashed using that setting (no commit ever ran —
// robust even to a hard tab crash that fires no device-lost event), so we ignore
// it and fall back to the safe floor. See _docs/specs/device-tessellation-defaults.md.

const STORAGE_KEY = 'vp.deviceTessellation';

const VALID_RES = new Set([0, 8, 16, 32, 64, 96]);
const VALID_DEPTH = new Set([0, 3, 4, 5, 6]);

type SentinelStatus = 'attempting' | 'committed';

interface StoredRecord {
	settings: TessellationSettings;
	status: SentinelStatus;
}

export interface LoadedTessellation {
	settings: TessellationSettings;
	/** The previous session crashed before committing → we fell back to the floor. */
	fellBack: boolean;
}

/** Validate parsed settings; null if not a usable TessellationSettings (corruption / version skew). */
export function coerceTessellation(raw: unknown): TessellationSettings | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	const { detail, vertexBudgetMillions: budget, maxPatchResolution: res, maxDepth: depth } = r;
	if (typeof detail !== 'number' || !Number.isFinite(detail) || detail <= 0) return null;
	if (typeof budget !== 'number' || !Number.isFinite(budget) || budget <= 0) return null;
	if (typeof res !== 'number' || !VALID_RES.has(res)) return null;
	if (typeof depth !== 'number' || !VALID_DEPTH.has(depth)) return null;
	return {
		detail,
		vertexBudgetMillions: budget,
		maxPatchResolution: res as TessellationSettings['maxPatchResolution'],
		maxDepth: depth as TessellationSettings['maxDepth']
	};
}

/** Parse a stored record string; null if malformed. */
export function parseStored(rawJson: string | null): StoredRecord | null {
	if (!rawJson) return null;
	let obj: unknown;
	try {
		obj = JSON.parse(rawJson);
	} catch {
		return null;
	}
	if (!obj || typeof obj !== 'object') return null;
	const status = (obj as Record<string, unknown>).status;
	if (status !== 'attempting' && status !== 'committed') return null;
	const settings = coerceTessellation((obj as Record<string, unknown>).settings);
	if (!settings) return null;
	return { settings, status };
}

/**
 * Sentinel decision (pure). Committed → trust it. Uncommitted "attempting" → the
 * last session crashed using it → fall back to the floor + flag it. No (or
 * corrupt) record → first visit → device-class default.
 */
export function decideTessellation(
	stored: StoredRecord | null,
	deviceDefault: TessellationSettings
): LoadedTessellation {
	if (stored?.status === 'committed') return { settings: stored.settings, fellBack: false };
	if (stored?.status === 'attempting') {
		return { settings: { ...MOBILE_TESSELLATION }, fellBack: true };
	}
	return { settings: deviceDefault, fellBack: false };
}

function readRaw(): string | null {
	try {
		return localStorage.getItem(STORAGE_KEY);
	} catch {
		return null;
	}
}

function writeRecord(rec: StoredRecord): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(rec));
	} catch {
		// Private mode / quota — degrade to no persistence (still safe: the default re-applies).
	}
}

/** Load the device tessellation, applying the sentinel decision. */
export function loadDeviceTessellation(deviceDefault: TessellationSettings): LoadedTessellation {
	return decideTessellation(parseStored(readRaw()), deviceDefault);
}

/** Record a setting as being attempted — call before the first heavy render with it. */
export function armDeviceTessellation(settings: TessellationSettings): void {
	writeRecord({ settings, status: 'attempting' });
}

/** Record a setting as having survived to a stable state. */
export function commitDeviceTessellation(settings: TessellationSettings): void {
	writeRecord({ settings, status: 'committed' });
}
