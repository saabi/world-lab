import type { GraphDocument } from '@world-lab/graph';

import {
	animatedWorleyPipelineGraph,
	bufferFeedbackGraph,
	computeBufferDoublingGraph,
	cosinePaletteEffectGraph,
	crossPassTextureReadGraph,
	defaultPreviewGraph,
	displacedSphereMeshGraph,
	legacyFullscreenFragmentGraph,
	rigidTransformsMeshGraph,
	rotatedPlaneMeshGraph,
	vertexKernelDisplacementGraph
} from './graphBuilders.js';
import { createGraphArtifact, type GraphArtifact } from './graphArtifact.js';

export interface GraphSample {
	id: string;
	label: string;
	build(): GraphDocument;
}

/** Named example graphs loadable into the editor canvas. */
export const GRAPH_SAMPLES: readonly GraphSample[] = [
	{
		id: 'migration-default-preview',
		label: 'Migration — legacy field preview (pre-sink)',
		build: defaultPreviewGraph
	},
	{
		id: 'migration-fullscreen-fragment',
		label: 'Migration — legacy fullscreen fragment (pre-sink)',
		build: legacyFullscreenFragmentGraph
	},
	{
		id: 'pipeline-worley-time',
		label: 'ShaderToy — Animated Worley',
		build: animatedWorleyPipelineGraph
	},
	{
		id: 'shadertoy-cosine-palette',
		label: 'ShaderToy — Cosine palette',
		build: cosinePaletteEffectGraph
	},
	{
		id: 'foundation-cross-pass-texture',
		label: 'Foundation — Cross-pass texture read',
		build: crossPassTextureReadGraph
	},
	{
		id: 'foundation-buffer-feedback',
		label: 'Foundation — Buffer feedback',
		build: bufferFeedbackGraph
	},
	{
		id: 'foundation-compute-buffer',
		label: 'Foundation — Compute buffer',
		build: computeBufferDoublingGraph
	},
	{
		id: 'foundation-vertex-kernel-displacement',
		label: 'Foundation — Vertex kernel displacement',
		build: vertexKernelDisplacementGraph
	},
	{
		id: 'mesh-displaced-sphere',
		label: 'Mesh — Displaced cube-sphere',
		build: displacedSphereMeshGraph
	},
	{
		id: 'mesh-rotated-plane',
		label: 'Mesh — Rotated plane',
		build: rotatedPlaneMeshGraph
	},
	{
		id: 'mesh-rigid-transforms',
		label: 'Mesh — Rigid transforms (plane)',
		build: rigidTransformsMeshGraph
	}
];

export function getGraphSample(id: string): GraphSample | undefined {
	return GRAPH_SAMPLES.find((sample) => sample.id === id);
}

/** Read-only bundled examples as unified `GraphArtifact`s. */
export function listSampleArtifacts(): GraphArtifact[] {
	return GRAPH_SAMPLES.map((sample) =>
		createGraphArtifact(sample.label, sample.build(), { sample: true })
	);
}

export function getSampleArtifact(id: string): GraphArtifact | undefined {
	const sample = getGraphSample(id);
	if (!sample) return undefined;
	return createGraphArtifact(sample.label, sample.build(), { sample: true });
}

/** Internal scalar preview graph (not listed in the samples UI). */
export function defaultPreviewSampleArtifact(): GraphArtifact {
	return createGraphArtifact('Default preview', defaultPreviewGraph(), { sample: true });
}
