import type { WgslModule, WgslModuleResolver } from '@world-lab/compiler';
import type { GroupDefinition, GroupResolver } from '@world-lab/graph';

import {
	MATH_REMAP_GROUP,
	SDF_OP_SUBTRACT_GROUP,
	TRANSFORM_NORMAL_DISPLACE_GROUP,
	TRANSFORM_SCALE_GROUP,
	TRANSFORM_SPHERIFY_GROUP,
	TRANSFORM_TRANSLATE_GROUP
} from './groups/index.js';
import { STANDARD_LIBRARY_MODULES } from './modules/index.js';

/** Resolves standard-library module ids to WGSL function sources (browser-safe, no fs). */
export function createStandardLibraryResolver(
	modules: Record<string, WgslModule> = STANDARD_LIBRARY_MODULES
): WgslModuleResolver {
	return {
		async resolve(moduleId: string): Promise<WgslModule> {
			const mod = modules[moduleId];
			if (!mod) {
				throw new Error(`Unknown module: ${moduleId}`);
			}
			return mod;
		}
	};
}

export const STANDARD_LIBRARY_GROUPS: Record<string, GroupDefinition> = {
	[MATH_REMAP_GROUP.id]: MATH_REMAP_GROUP,
	[SDF_OP_SUBTRACT_GROUP.id]: SDF_OP_SUBTRACT_GROUP,
	[TRANSFORM_NORMAL_DISPLACE_GROUP.id]: TRANSFORM_NORMAL_DISPLACE_GROUP,
	[TRANSFORM_SCALE_GROUP.id]: TRANSFORM_SCALE_GROUP,
	[TRANSFORM_SPHERIFY_GROUP.id]: TRANSFORM_SPHERIFY_GROUP,
	[TRANSFORM_TRANSLATE_GROUP.id]: TRANSFORM_TRANSLATE_GROUP
};

export function createStandardLibraryGroupResolver(
	groups: Record<string, GroupDefinition> = STANDARD_LIBRARY_GROUPS
): GroupResolver {
	return {
		async resolve(groupId: string): Promise<GroupDefinition> {
			const group = groups[groupId];
			if (!group) {
				throw new Error(`Unknown group: ${groupId}`);
			}
			return group;
		}
	};
}
