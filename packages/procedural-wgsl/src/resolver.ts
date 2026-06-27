import type { WgslModule, WgslModuleResolver } from '@virtual-planet/compiler';

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
