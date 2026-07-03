import '@world-lab/graph';
import { describe, expect, it } from 'vitest';
import { effectiveGraphDocument, pipelineFieldOutput } from '@world-lab/graph';

import { assembleFullscreenFragmentModuleAsync } from '../src/consumers/fullscreenFragment.js';
import { assemblePlaneScalarPreviewShader } from '../src/consumers/planeScalarPreview.js';
import { SURFACE_MESH_PREVIEW_SHADER } from '../src/consumers/surfaceMeshPreview.js';
import { assembleVegetationCandidatesShader } from '../src/consumers/vegetationCandidates.js';
import { createStandardLibraryResolver } from '../src/moduleResolver.js';
import {
	PARITY_DENSITY_GRAPH,
	PARITY_PLACEMENT_GRAPH,
	parityResolver
} from '../src/fixtures/vegetationParity.js';
import {
	constantVec4FragmentGraph,
	cosinePalettePipelineGraph,
	planeScalarPreviewGraph,
	worleyPipelineGraph
} from './sampleGraphs.js';
import { expectShaderCompiles, shouldSkipWebGPUTest } from '../src/testSupport/webgpuTestEnv.js';

interface ConsumerCompileCase {
	name: string;
	assemble: () => Promise<string>;
}

function cosinePaletteOutput() {
	return { node: 'n_effect', port: 'color' };
}

describe('consumer device-compile coverage', () => {
	const cases: ConsumerCompileCase[] = [
		{
			name: 'fullscreen-fragment cosine palette (ShaderToy host)',
			assemble: async () => {
				const graph = cosinePalettePipelineGraph();
				const { code } = await assembleFullscreenFragmentModuleAsync(
					graph,
					cosinePaletteOutput(),
					createStandardLibraryResolver()
				);
				return code;
			}
		},
		{
			name: 'fullscreen-fragment constant.f32 GraphParams regression',
			assemble: async () => {
				const graph = constantVec4FragmentGraph();
				const { code } = await assembleFullscreenFragmentModuleAsync(
					graph,
					{ node: 'n_vec4', port: 'value' },
					createStandardLibraryResolver()
				);
				return code;
			}
		},
		{
			name: 'fullscreen-fragment worley pipeline field',
			assemble: async () => {
				const graph = effectiveGraphDocument(worleyPipelineGraph());
				const output = pipelineFieldOutput(graph);
				expect(output).toBeTruthy();
				const { code } = await assembleFullscreenFragmentModuleAsync(
					graph,
					output!,
					createStandardLibraryResolver()
				);
				return code;
			}
		},
		{
			name: 'plane-scalar preview compute',
			assemble: () =>
				assemblePlaneScalarPreviewShader(planeScalarPreviewGraph(), {
					node: 'n_remap',
					port: 'value'
				})
		},
		{
			name: 'vegetation-candidates compute',
			assemble: async () => {
				const { code } = await assembleVegetationCandidatesShader({
					density: {
						graph: PARITY_DENSITY_GRAPH,
						output: { node: 'n_density', port: 'density' }
					},
					placement: {
						graph: PARITY_PLACEMENT_GRAPH,
						output: { node: 'n_placement', port: 'value' }
					},
					moduleResolver: parityResolver()
				});
				return code;
			}
		},
		{
			name: 'mesh-gen compute (decomposed cube-sphere)',
			assemble: async () => {
				const { assembleMeshGenShader, meshGenRequestForLegacySurface } = await import(
					'../src/consumers/meshGen.js'
				);
				return assembleMeshGenShader(
					meshGenRequestForLegacySurface('surface.cubeSphere', 4, { decomposedCubeSphere: true })
				);
			}
		},
		{
			name: 'surface-mesh preview raster',
			assemble: async () => SURFACE_MESH_PREVIEW_SHADER
		}
	];

	it.skipIf(shouldSkipWebGPUTest())(
		'device-compiles every representative consumer shader with zero error-severity messages',
		async () => {
			for (const consumerCase of cases) {
				const code = await consumerCase.assemble();
				await expectShaderCompiles(code, consumerCase.name);
			}
		},
		60_000
	);

	it('documents the pre-fix fullscreen-fragment params bug as a compile regression', async () => {
		const broken = `
struct GraphParams { width: f32, height: f32, }
@group(0) @binding(0) var<uniform> params: GraphParams;
@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
	return vec4f(params.p_n_const_value, 0.0, 0.0, 1.0);
}
`;
		if (shouldSkipWebGPUTest()) return;
		const errors = await import('../src/testSupport/webgpuTestEnv.js').then((mod) =>
			mod.validateShaderModule(broken, 'missing-params-field')
		);
		expect(errors.length).toBeGreaterThan(0);
	});
});
