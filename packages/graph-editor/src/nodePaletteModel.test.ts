import { Type } from '@world-lab/schema';
import { describe, expect, it } from 'vitest';
import type { NodePrimitive } from '@world-lab/graph';

import {
	contractGroupLabel,
	filterPaletteGroups,
	filterPrimitives,
	groupPrimitives,
	isPaletteGroupOpen,
	paletteGroupHasMatch,
	togglePaletteGroupExpanded
} from './nodePaletteModel.js';

const emptyParams = Type.Object({});

function mockPrimitive(
	id: string,
	category: string,
	opts: { role?: string; keywords?: string[]; description?: string } = {}
): NodePrimitive {
	return {
		id,
		category,
		inputs: [{ name: 'a', dataType: 'f32' }],
		outputs: [{ name: 'out', dataType: 'f32' }],
		params: emptyParams,
		implementation: { kind: 'wgsl-function', moduleId: id, entry: id },
		wgsl: { moduleId: id, entry: id },
		metadata: {
			...(opts.role ? { role: opts.role } : {}),
			...(opts.keywords ? { keywords: opts.keywords } : {}),
			...(opts.description ? { description: opts.description } : {})
		}
	};
}

describe('filterPrimitives', () => {
	const library = [
		mockPrimitive('noise.perlin3d', 'noise', { keywords: ['Noise'], description: 'Perlin noise' }),
		mockPrimitive('math.add', 'math'),
		mockPrimitive('geo.plane', 'geometry/source')
	];

	it('returns all primitives for an empty query', () => {
		expect(filterPrimitives(library, '')).toHaveLength(3);
		expect(filterPrimitives(library, '   ')).toHaveLength(3);
	});

	it('matches id, category, and keywords', () => {
		expect(filterPrimitives(library, 'perlin').map((p) => p.id)).toEqual(['noise.perlin3d']);
		expect(filterPrimitives(library, 'geometry').map((p) => p.id)).toEqual(['geo.plane']);
		expect(filterPrimitives(library, 'Noise').map((p) => p.id)).toEqual(['noise.perlin3d']);
	});

	it('excludes non-matches', () => {
		expect(filterPrimitives(library, 'cosine')).toHaveLength(0);
	});
});

describe('groupPrimitives', () => {
	const library = [
		mockPrimitive('math.add', 'math'),
		mockPrimitive('math.max', 'math'),
		mockPrimitive('noise.perlin3d', 'noise'),
		mockPrimitive('geo.plane', 'geometry/source'),
		mockPrimitive('transform.twist', 'transform', { role: 'positionTransform' }),
		mockPrimitive('transform.displace', 'transform', { role: 'positionTransform' })
	];

	it('groups by category in section mode and splits path-like categories', () => {
		const groups = groupPrimitives(library, 'section');
		const geometry = groups.find((group) => group.key === 'geometry');
		expect(geometry?.subgroups?.[0]).toMatchObject({
			key: 'geometry/source',
			label: 'source',
			primitives: [expect.objectContaining({ id: 'geo.plane' })]
		});
		expect(groups.find((group) => group.key === 'math')?.primitives.map((p) => p.id)).toEqual([
			'math.add',
			'math.max'
		]);
	});

	it('sorts primitives by id within a group', () => {
		const math = groupPrimitives(library, 'section').find((group) => group.key === 'math');
		expect(math?.primitives.map((p) => p.id)).toEqual(['math.add', 'math.max']);
	});

	it('groups by swapFamily in contract mode', () => {
		const groups = groupPrimitives(library, 'contract');
		const position = groups.find((group) => group.key === 'positionTransform');
		expect(position?.label).toBe('Position Transform');
		expect(position?.primitives.map((p) => p.id)).toEqual([
			'transform.displace',
			'transform.twist'
		]);
	});

	it('nests contract groups under section heads in both mode', () => {
		const groups = groupPrimitives(library, 'both');
		const transform = groups.find((group) => group.key === 'transform');
		expect(transform?.subgroups?.some((sub) => sub.key === 'positionTransform')).toBe(true);
		expect(transform?.subgroups?.find((sub) => sub.key === 'positionTransform')?.primitives).toHaveLength(
			2
		);
	});

	it('uses contractOf label when no role is set', () => {
		const add = mockPrimitive('math.add', 'math');
		expect(contractGroupLabel(add)).toBe('f32->f32');
	});
});

describe('filterPaletteGroups', () => {
	it('keeps only groups that contain visible primitives', () => {
		const groups = groupPrimitives(
			[mockPrimitive('math.add', 'math'), mockPrimitive('noise.perlin3d', 'noise')],
			'section'
		);
		const visible = new Set(['math.add']);
		const filtered = filterPaletteGroups(groups, visible);
		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.key).toBe('math');
		expect(paletteGroupHasMatch(filtered[0]!, visible)).toBe(true);
	});
});

describe('isPaletteGroupOpen', () => {
	const empty = new Set<string>();

	it('returns collapsed for all keys with no stored expansions', () => {
		expect(isPaletteGroupOpen('math', empty, false)).toBe(false);
		expect(isPaletteGroupOpen('noise', empty, false)).toBe(false);
	});

	it('returns open only for explicitly expanded keys', () => {
		const expanded = togglePaletteGroupExpanded('math', empty);
		expect(isPaletteGroupOpen('math', expanded, false)).toBe(true);
		expect(isPaletteGroupOpen('noise', expanded, false)).toBe(false);
	});

	it('forces all groups open during search', () => {
		expect(isPaletteGroupOpen('math', empty, true)).toBe(true);
		expect(isPaletteGroupOpen('noise', empty, true)).toBe(true);
	});
});

describe('togglePaletteGroupExpanded', () => {
	it('adds and removes keys idempotently', () => {
		const first = togglePaletteGroupExpanded('math', new Set());
		expect([...first]).toEqual(['math']);
		const second = togglePaletteGroupExpanded('math', first);
		expect([...second]).toEqual([]);
	});
});
