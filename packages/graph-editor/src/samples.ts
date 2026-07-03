import type { GraphDocument } from '@world-lab/graph';

import {
	animatedWorleyPipelineGraph,
	cosinePaletteEffectGraph,
	defaultPreviewGraph,
	displacedSphereMeshGraph
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
		id: 'mesh-displaced-sphere',
		label: 'Mesh — Displaced cube-sphere',
		build: displacedSphereMeshGraph
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
