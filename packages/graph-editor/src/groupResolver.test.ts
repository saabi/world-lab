import '@world-lab/graph';
import { createStandardLibraryGroupResolver } from '@world-lab/procedural-wgsl';
import { describe, expect, it } from 'vitest';

import { resolvePrimitiveGroup } from './groupResolver.js';

describe('resolvePrimitiveGroup', () => {
	it('resolves group-backed primitives for editor expansion', async () => {
		const group = await resolvePrimitiveGroup(
			'transform.spherify',
			createStandardLibraryGroupResolver()
		);
		expect(group?.id).toBe('transform.spherify');
		expect(group?.subgraph.nodes.length).toBeGreaterThan(0);
	});

	it('returns null for ordinary WGSL primitives', async () => {
		await expect(
			resolvePrimitiveGroup('math.add', createStandardLibraryGroupResolver())
		).resolves.toBeNull();
	});
});
