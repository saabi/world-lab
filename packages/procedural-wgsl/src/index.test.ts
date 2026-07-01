import { describe, expect, it } from 'vitest';

import { listPrimitives } from '../../graph/src/registry.js';
import '../../graph/src/primitives/index.js';

import {
	createStandardLibraryResolver,
	PROCEDURAL_WGSL_PACKAGE,
	STANDARD_LIBRARY_MODULES
} from './index.js';

/** Module ids resolved by the library but not registered as graph primitives. */
const RESOLVER_ONLY_WGSL_MODULE_IDS: readonly string[] = [
	'noise.hash2d',
	'color.colorlabCommon',
	'sdf.opUnion',
	'sdf.opIntersect'
];

/** Module id → exported entry fn name (matches graph primitive `wgsl.entry`). */
const STANDARD_LIBRARY_ENTRIES: Record<string, string> = {
	'procedural.uv': 'uv',
	'procedural.metricPosition': 'metricPosition',
	'noise.perlin3d': 'perlin3d',
	'noise.value2d': 'value2d',
	'noise.perlin2d': 'perlin2d',
	'noise.perlin2dDeriv': 'perlin2dDeriv',
	'noise.worley2d': 'worley2d',
	'noise.voronoi2d': 'voronoi2d',
	'noise.blue2d': 'blue2d',
	'noise.simplex': 'simplex3d',
	'noise.worley': 'worley',
	'noise.fbm': 'fbm',
	'noise.ridgedFbm': 'ridgedFbm',
	'math.remap': 'remap',
	'math.clamp': 'clamp',
	'math.smoothstep': 'smoothstep',
	'math.add': 'add',
	'math.subtract': 'subtract',
	'math.divide': 'divide',
	'math.multiply': 'multiply',
	'math.min': 'mathMin',
	'math.max': 'mathMax',
	'math.negate': 'negate',
	'math.mix': 'mix',
	'math.pow': 'pow',
	'math.abs': 'abs',
	'math.bias': 'bias',
	'math.gain': 'gain',
	'surface.plane': 'plane',
	'surface.cubeSphere': 'cubeSphere',
	'surface.cubeFaceDir': 'cubeFaceDir',
	'terrain.domainWarp': 'domainWarp',
	'terrain.voronoi': 'voronoi',
	'terrain.detailFbm': 'detailFbm',
	'terrain.heightRemap': 'heightRemap',
	'terrain.fineTextureNoise': 'fineTextureNoise',
	'terrain.polarTerm': 'polarTerm',
	'terrain.biomeMaterial': 'biomeMaterial',
	'terrain.normalEstimator': 'normalEstimator',
	'terrain.worldNormal': 'worldNormal',
	'terrain.selfShadow': 'selfShadow',
	'material.pbrLighting': 'pbrLighting',
	'sdf.opSubtract': 'opSubtract',
	'sdf.opUnion': 'opUnion',
	'sdf.opIntersect': 'opIntersect',
	'sdf.circle': 'sdfCircle',
	'sdf.box': 'sdfBox',
	'sdf.segment': 'sdfSegment',
	'color.srgbToLinear': 'srgbToLinear',
	'color.linearToSrgb': 'linearToSrgb',
	'color.hsv2rgb': 'hsv2rgb',
	'color.srgbTransfer': 'srgbTransfer',
	'color.srgbTransferInv': 'srgbTransferInv',
	'color.srgbToXyz': 'srgbToXyz',
	'color.xyzToSrgb': 'xyzToSrgb',
	'color.xyzToLab': 'xyzToLab',
	'color.labToXyz': 'labToXyz',
	'color.xyzToLuv': 'xyzToLuv',
	'color.luvToXyz': 'luvToXyz',
	'color.lsrgbToOklab': 'lsrgbToOklab',
	'color.oklabToLsrgb': 'oklabToLsrgb',
	'color.oklabToOklch': 'oklabToOklch',
	'color.oklchToOklab': 'oklchToOklab',
	'geometry.plane': 'planeGrid',
	'stage.vertex': 'vertexStage'
};

function registeredWgslModuleIds(): string[] {
	return [
		...new Set(
			listPrimitives()
				.map((primitive) => primitive.wgsl.moduleId)
				.filter((moduleId) => moduleId.length > 0)
		)
	].sort();
}

describe('@virtual-planet/procedural-wgsl', () => {
	it('exports its package identity', () => {
		expect(PROCEDURAL_WGSL_PACKAGE).toBe('@virtual-planet/procedural-wgsl');
	});

	it('maps every standard-library id to a module with source', () => {
		for (const moduleId of Object.keys(STANDARD_LIBRARY_ENTRIES)) {
			expect(STANDARD_LIBRARY_MODULES[moduleId]?.id).toBe(moduleId);
			expect(STANDARD_LIBRARY_MODULES[moduleId]?.source.length).toBeGreaterThan(0);
		}
	});

	it('covers every registered primitive WGSL module id', () => {
		const primitiveModuleIds = registeredWgslModuleIds();
		const libraryModuleIds = Object.keys(STANDARD_LIBRARY_MODULES).sort();

		const missingFromLibrary = primitiveModuleIds.filter(
			(moduleId) =>
				!RESOLVER_ONLY_WGSL_MODULE_IDS.includes(moduleId) &&
				!STANDARD_LIBRARY_MODULES[moduleId]
		);
		expect(missingFromLibrary).toEqual([]);

		const orphanLibraryModules = libraryModuleIds.filter(
			(moduleId) =>
				!RESOLVER_ONLY_WGSL_MODULE_IDS.includes(moduleId) &&
				!primitiveModuleIds.includes(moduleId)
		);
		expect(orphanLibraryModules).toEqual([]);

		expect(libraryModuleIds).toEqual([...primitiveModuleIds, ...RESOLVER_ONLY_WGSL_MODULE_IDS].sort());
	});

	it('createStandardLibraryResolver resolves each id with the expected entry fn', async () => {
		const resolver = createStandardLibraryResolver();

		for (const [moduleId, entry] of Object.entries(STANDARD_LIBRARY_ENTRIES)) {
			const mod = await resolver.resolve(moduleId);
			expect(mod.id).toBe(moduleId);
			expect(mod.source).toContain(`fn ${entry}(`);
		}
	});

	it('createStandardLibraryResolver throws for unknown ids', async () => {
		const resolver = createStandardLibraryResolver();
		await expect(resolver.resolve('missing.module')).rejects.toThrow('Unknown module: missing.module');
	});

	it('noise.fbm declares a dependency on noise.perlin3d', () => {
		expect(STANDARD_LIBRARY_MODULES['noise.fbm']?.dependencies).toEqual(['noise.perlin3d']);
		expect(STANDARD_LIBRARY_MODULES['noise.fbm']?.source).toContain('perlin3d(');
	});

	it('noise.ridgedFbm declares a dependency on noise.perlin3d', () => {
		expect(STANDARD_LIBRARY_MODULES['noise.ridgedFbm']?.dependencies).toEqual(['noise.perlin3d']);
		expect(STANDARD_LIBRARY_MODULES['noise.ridgedFbm']?.source).toContain('perlin3d(');
	});

	it('math.gain declares a dependency on math.bias', () => {
		expect(STANDARD_LIBRARY_MODULES['math.gain']?.dependencies).toEqual(['math.bias']);
		expect(STANDARD_LIBRARY_MODULES['math.gain']?.source).toContain('bias(');
	});

	it('stage.vertex declares a dependency on geometry.plane', () => {
		expect(STANDARD_LIBRARY_MODULES['stage.vertex']?.dependencies).toEqual(['geometry.plane']);
		expect(STANDARD_LIBRARY_MODULES['stage.vertex']?.source).toContain('plane_grid_position(');
	});

	it('no registered primitive WGSL module emits an empty function body', () => {
		for (const moduleId of registeredWgslModuleIds()) {
			const source = STANDARD_LIBRARY_MODULES[moduleId]?.source ?? '';
			expect(source, moduleId).not.toMatch(/fn\s+\w+\([^)]*\)\s*\{\s*\}/);
		}
	});
});
