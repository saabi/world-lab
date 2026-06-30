import type { PaletteMode } from './nodePaletteModel.js';

export const NODE_PALETTE_STORAGE_KEY = 'virtual-planet:graph-editor-palette:v1';

export interface StoredPaletteState {
	mode: PaletteMode;
	collapsedGroups: string[];
}

const DEFAULT_STATE: StoredPaletteState = {
	mode: 'section',
	collapsedGroups: []
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMode(value: unknown): PaletteMode | null {
	if (value === 'section' || value === 'contract' || value === 'both') return value;
	return null;
}

export function loadPaletteState(key = NODE_PALETTE_STORAGE_KEY): StoredPaletteState {
	if (typeof localStorage === 'undefined') return { ...DEFAULT_STATE };

	const raw = localStorage.getItem(key);
	if (!raw) return { ...DEFAULT_STATE };

	try {
		const parsed: unknown = JSON.parse(raw);
		if (!isRecord(parsed)) return { ...DEFAULT_STATE };
		const mode = parseMode(parsed.mode) ?? DEFAULT_STATE.mode;
		const collapsedGroups = Array.isArray(parsed.collapsedGroups)
			? parsed.collapsedGroups.filter((entry): entry is string => typeof entry === 'string')
			: [];
		return { mode, collapsedGroups };
	} catch {
		return { ...DEFAULT_STATE };
	}
}

export function savePaletteState(state: StoredPaletteState, key = NODE_PALETTE_STORAGE_KEY): void {
	if (typeof localStorage === 'undefined') return;
	localStorage.setItem(key, JSON.stringify(state));
}
