import { derivePipelinePresentations, type GraphDocument, type PortRef } from '@virtual-planet/graph';

import type { PassGraph } from './frameGraph/types.js';

export interface GraphFramePass {
	targetId: string;
	fieldOutput: PortRef;
}

/** Independent pipeline display sinks — one GPU pass each (no cross-target reads yet). */
export function planIndependentGraphFramePasses(doc: GraphDocument): GraphFramePass[] {
	return derivePipelinePresentations(doc).map((presentation) => ({
		targetId: presentation.displayNodeId,
		fieldOutput: presentation.fieldOutput
	}));
}

export function buildIndependentPassGraph(passes: GraphFramePass[]): PassGraph {
	const targets = passes.map((pass) => ({
		id: pass.targetId,
		format: 'rgba8unorm' as GPUTextureFormat,
		size: { kind: 'screen-relative' as const, scale: 1 }
	}));
	return {
		targets,
		passes: passes.map((pass) => ({
			consumerId: pass.targetId,
			writeTarget: pass.targetId,
			reads: []
		})),
		display: passes[0]?.targetId ?? ''
	};
}
