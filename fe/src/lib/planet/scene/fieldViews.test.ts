import { describe, expect, it } from 'vitest';
import { fieldViews, sourceLabel, termsLabel } from './fieldViews.js';
import type { FieldTerm, SceneNode } from './types.js';

function node(extra: Partial<SceneNode> = {}): SceneNode {
	return {
		id: 'n',
		name: 'n',
		parentId: null,
		kind: 'group',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
		...extra
	} as SceneNode;
}

describe('fieldViews', () => {
	it('separates driven channels (terms + live value) from literals', () => {
		const stored = node({
			transform: { position: [1, 2, 3], rotation: [0, 0, 0, 1] },
			bindings: [{ field: 'positionX', source: { ref: '/d', output: 'radius' } }]
		});
		// Evaluated: the driver wrote positionX = 600; the rest is the literal.
		const evaluated = node({ transform: { position: [600, 2, 3], rotation: [0, 0, 0, 1] } });
		const views = fieldViews(stored, evaluated);
		const x = views.find((v) => v.channel === 'positionX')!;
		expect(x.terms).toHaveLength(1);
		expect(x.value).toBe(600); // live
		expect(x.literal).toBe(1); // stored seed

		const y = views.find((v) => v.channel === 'positionY')!;
		expect(y.terms).toHaveLength(0); // pure literal
		expect(y.value).toBe(2);
		expect(views).toHaveLength(9); // 3 pos + 3 rot + 3 scale
	});
});

describe('term labels', () => {
	it('renders a folded expression', () => {
		const terms: FieldTerm[] = [
			{ field: 'positionX', op: 'set', source: { ref: '/driver', output: 'radius' } },
			{ field: 'positionX', op: 'mul', source: { const: 2 } },
			{ field: 'positionX', op: 'add', source: { const: 100 } }
		];
		expect(termsLabel(terms)).toBe('/driver#radius · 2 + 100');
	});

	it('renders constant and ref sources', () => {
		expect(sourceLabel({ const: 42 })).toBe('42');
		expect(sourceLabel({ ref: '../..', output: 'phase' })).toBe('../..#phase');
	});
});
