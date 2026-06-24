import { browser } from '$app/environment';
import {
	defaultSceneEditorLayout,
	LAYOUT_DOCUMENT_VERSION,
	parseLayoutDocument,
	type LayoutDocument
} from '@virtual-planet/subdivide';

export const SCENE_LAYOUT_KEY = 'virtual-planet:scene-layout:v1';

interface StoredSceneLayout {
	version: number;
	layout: LayoutDocument;
}

export function loadSceneLayout(): LayoutDocument {
	if (!browser) return defaultSceneEditorLayout();
	try {
		const raw = localStorage.getItem(SCENE_LAYOUT_KEY);
		if (!raw) return defaultSceneEditorLayout();
		const parsed = JSON.parse(raw) as unknown;
		if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && 'layout' in parsed) {
			const stored = parsed as StoredSceneLayout;
			if (stored.version === LAYOUT_DOCUMENT_VERSION) {
				return parseLayoutDocument(stored.layout, 'viewport');
			}
			// v1 layouts lack the flight deck — fall through to the v2 default.
		}
	} catch {
		/* private mode / corrupt — fall through */
	}
	return defaultSceneEditorLayout();
}

export function saveSceneLayout(doc: LayoutDocument): void {
	if (!browser) return;
	try {
		const stored: StoredSceneLayout = { version: LAYOUT_DOCUMENT_VERSION, layout: doc };
		localStorage.setItem(SCENE_LAYOUT_KEY, JSON.stringify(stored));
	} catch {
		/* quota / private mode */
	}
}

export function debounce<T extends (...args: never[]) => void>(
	fn: T,
	ms: number
): (...args: Parameters<T>) => void {
	let timer: ReturnType<typeof setTimeout> | undefined;
	return (...args: Parameters<T>) => {
		clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	};
}
