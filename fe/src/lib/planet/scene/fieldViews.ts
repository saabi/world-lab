import type { FieldTerm, SceneNode, TermOp, TermSource, TransformField } from './types.js';
import { quatToEuler } from './transform.js';

// Field-view resolution for the editor: per transform channel, the composing terms,
// the LIVE evaluated value (display), and the stored literal (the fold seed a literal
// edit writes). Pure → unit-tested. See _docs/specs/driven-fields-editor.md.

export interface FieldView {
	channel: TransformField;
	/** [] = pure literal; otherwise the channel's composing terms (driven). */
	terms: FieldTerm[];
	/** Live evaluated value. For rotation channels this is the ZYX euler component (radians). */
	value: number;
	/** Stored base value — the fold's seed; a literal edit writes this. */
	literal: number;
}

const CHANNELS: ReadonlyArray<{
	channel: TransformField;
	group: 'pos' | 'rot' | 'scl';
	axis: 0 | 1 | 2;
}> = [
	{ channel: 'positionX', group: 'pos', axis: 0 },
	{ channel: 'positionY', group: 'pos', axis: 1 },
	{ channel: 'positionZ', group: 'pos', axis: 2 },
	{ channel: 'rotationX', group: 'rot', axis: 0 },
	{ channel: 'rotationY', group: 'rot', axis: 1 },
	{ channel: 'rotationZ', group: 'rot', axis: 2 },
	{ channel: 'scaleX', group: 'scl', axis: 0 },
	{ channel: 'scaleY', group: 'scl', axis: 1 },
	{ channel: 'scaleZ', group: 'scl', axis: 2 }
];

/** Per-channel views for a node, given its evaluated counterpart (live values). */
export function fieldViews(node: SceneNode, evaluated: SceneNode): FieldView[] {
	const lit = {
		pos: node.transform.position,
		rot: quatToEuler(node.transform.rotation),
		scl: node.transform.scale ?? [1, 1, 1]
	};
	const val = {
		pos: evaluated.transform.position,
		rot: quatToEuler(evaluated.transform.rotation),
		scl: evaluated.transform.scale ?? [1, 1, 1]
	};
	const terms = node.bindings ?? [];
	return CHANNELS.map(({ channel, group, axis }) => ({
		channel,
		terms: terms.filter((t) => t.field === channel),
		value: val[group][axis],
		literal: lit[group][axis]
	}));
}

/** Source label: `ref#output` or the constant. */
export function sourceLabel(source: TermSource): string {
	return 'const' in source ? String(source.const) : `${source.ref}#${source.output}`;
}

const OP_SYMBOL: Record<TermOp, string> = { set: '=', add: '+', mul: '·' };

/** Folded expression as text, e.g. `../#radius · 2 + 100`. First `set` term is bare. */
export function termsLabel(terms: FieldTerm[]): string {
	return terms
		.map((t, i) => {
			const op = t.op ?? 'set';
			const s = sourceLabel(t.source);
			return i === 0 && op === 'set' ? s : `${OP_SYMBOL[op]} ${s}`;
		})
		.join(' ');
}
