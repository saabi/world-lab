import type { SemanticTag } from './types.js';

/** Return semantic tags as a stable set without mutating the caller's array. */
export function dedupeCanonicalSemantics(tags: readonly SemanticTag[]): SemanticTag[] {
	return [...new Set(tags)].sort();
}
