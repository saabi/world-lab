import { derivePipelinePresentations, type GraphDocument, type PortRef } from '@world-lab/graph';

import type { PassGraph } from './frameGraph/types.js';

export interface GraphFramePass {
	targetId: string;
	fieldOutput: PortRef;
}

/** Independent pipeline display sinks — one GPU pass each (no cross-target reads yet).
 *  `targetId` is the presentation's **output name** so it matches the preview buffer id
 *  (`enumeratePreviewBuffers`) the pane looks up in the frame snapshot. */
export function planIndependentGraphFramePasses(doc: GraphDocument): GraphFramePass[] {
	return derivePipelinePresentations(doc).map((presentation) => ({
		targetId: presentation.outputName,
		fieldOutput: presentation.fieldOutput
	}));
}

export function buildIndependentPassGraph(passes: GraphFramePass[]): PassGraph {
	const targets = passes.map((pass) => ({
		id: pass.targetId,
		shape: {
			kind: 'texture' as const,
			dimension: '2d' as const,
			sample: 'float' as const,
			format: 'rgba8unorm'
		},
		lifetime: { kind: 'transient' as const },
		size: { kind: 'screen-relative' as const, scale: 1 }
	}));
	return {
		targets,
		passes: passes.map((pass) => ({
			consumerId: pass.targetId,
			writeTarget: pass.targetId,
			reads: []
		})),
		display: passes[0]?.targetId ?? '',
		readbackTargets: passes.map((pass) => pass.targetId)
	};
}
