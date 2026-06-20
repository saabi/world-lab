import { describe, expect, it } from 'vitest';
import { resolvePath } from './scenePath.js';
import { IDENTITY_QUAT } from './transform.js';
import type { PlanetScene, SceneNode } from './types.js';

function group(id: string, name: string, parentId: string | null): SceneNode {
	return {
		id,
		name,
		parentId,
		kind: 'group',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: IDENTITY_QUAT }
	};
}

// root(Solar System) → sol(Sol) → ferro(Ferro) → luna(Luna F); sol also has cerule.
const scene: PlanetScene = {
	rootId: 'root',
	nodes: new Map(
		[
			group('root', 'Solar System', null),
			group('sol', 'Sol', 'root'),
			group('ferro', 'Ferro', 'sol'),
			group('luna', 'Luna F', 'ferro'),
			group('cerule', 'Cerule', 'sol')
		].map((n) => [n.id, n])
	)
};

describe('resolvePath', () => {
	it('resolves absolute paths from the (unnamed) root', () => {
		expect(resolvePath(scene, 'luna', '/')).toBe('root');
		expect(resolvePath(scene, 'luna', '/sol')).toBe('sol');
		expect(resolvePath(scene, 'luna', '/sol/ferro')).toBe('ferro');
	});

	it('resolves relative paths (.. = parent, names descend)', () => {
		expect(resolvePath(scene, 'luna', '../')).toBe('ferro'); // parent
		expect(resolvePath(scene, 'luna', '../../')).toBe('sol'); // grandparent
		expect(resolvePath(scene, 'ferro', '../cerule')).toBe('cerule'); // sibling (non-ancestor)
		expect(resolvePath(scene, 'sol', 'ferro')).toBe('ferro'); // child
	});

	it('normalizes name segments (case / spaces)', () => {
		expect(resolvePath(scene, 'root', '/sol/ferro/luna-f')).toBe('luna'); // "Luna F" → luna-f
	});

	it('returns null for the world frame (above root) or a missing segment', () => {
		expect(resolvePath(scene, 'sol', '../../')).toBeNull(); // above root → world
		expect(resolvePath(scene, 'sol', 'nope')).toBeNull();
	});
});
