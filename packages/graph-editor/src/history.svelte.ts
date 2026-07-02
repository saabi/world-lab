import type { GraphDocument } from '@world-lab/graph';

interface HistoryEntry {
	doc: GraphDocument;
	label: string;
}

export interface GraphHistory {
	readonly canUndo: boolean;
	readonly canRedo: boolean;
	readonly undoLabel: string | null;
	readonly redoLabel: string | null;
	/** Record `previousDoc` (the state *before* the edit just applied) under `label`. */
	capture(previousDoc: GraphDocument, label: string): void;
	/** Returns the document to restore, or null if there's nothing to undo. */
	undo(currentDoc: GraphDocument): GraphDocument | null;
	/** Returns the document to restore, or null if there's nothing to redo. */
	redo(currentDoc: GraphDocument): GraphDocument | null;
	/** Clears both stacks — call when loading/creating a document, not when editing one. */
	reset(): void;
}

export function createGraphHistory(): GraphHistory {
	// $state.raw: reactive on reassignment (canUndo/canRedo/labels re-read the arrays) but NOT
	// deeply proxied — entries hold immutable GraphDocument values from applyEditIntent, and
	// deep-proxying them would both wrap undo()/redo()'s return value (breaking `===` identity
	// for callers) and needlessly proxy potentially-large graphs on every capture.
	let past = $state.raw<HistoryEntry[]>([]);
	let future = $state.raw<HistoryEntry[]>([]);

	return {
		get canUndo() {
			return past.length > 0;
		},
		get canRedo() {
			return future.length > 0;
		},
		get undoLabel() {
			return past.at(-1)?.label ?? null;
		},
		get redoLabel() {
			return future.at(-1)?.label ?? null;
		},
		capture(previousDoc, label) {
			past = [...past, { doc: previousDoc, label }];
			future = [];
		},
		undo(currentDoc) {
			const entry = past.at(-1);
			if (!entry) return null;
			past = past.slice(0, -1);
			future = [...future, { doc: currentDoc, label: entry.label }];
			return entry.doc;
		},
		redo(currentDoc) {
			const entry = future.at(-1);
			if (!entry) return null;
			future = future.slice(0, -1);
			past = [...past, { doc: currentDoc, label: entry.label }];
			return entry.doc;
		},
		reset() {
			past = [];
			future = [];
		}
	};
}
