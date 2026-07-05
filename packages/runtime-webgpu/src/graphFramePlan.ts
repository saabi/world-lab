import {
	derivePipelinePresentations,
	type GraphDocument,
	type PortRef
} from '@world-lab/graph';

import type { PassGraph } from './frameGraph/types.js';
import { parseChannelIndex, upstreamNodeIds } from './graphReachability.js';

export interface GraphFramePass {
	targetId: string;
	fieldOutput: PortRef;
}

export interface ChannelDependency {
	consumerId: string;
	channel: number;
	sourceTargetId: string;
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
	return buildPassGraphWithChannelReads(passes, []);
}

export function resolveChannelDependencies(
	doc: GraphDocument,
	passes: readonly GraphFramePass[]
): ChannelDependency[] {
	const targetIdByDisplayNodeId = new Map(
		derivePipelinePresentations(doc).map((presentation) => [
			presentation.displayNodeId,
			presentation.outputName
		])
	);
	const dependencies: ChannelDependency[] = [];

	for (const pass of passes) {
		const byChannel = new Map<number, string>();
		for (const nodeId of upstreamNodeIds(doc, pass.fieldOutput.node)) {
			const node = doc.nodes.find((candidate) => candidate.id === nodeId);
			if (node?.primitive !== 'input.channel') continue;
			const channel = parseChannelIndex(
				node.params?.channel,
				`input.channel node ${node.id}`
			);
			const sourceDisplayId = node.params?.sourceDisplayId;
			if (typeof sourceDisplayId !== 'string' || sourceDisplayId.length === 0) {
				throw new Error(`input.channel node ${node.id} requires sourceDisplayId`);
			}
			const sourceTargetId = targetIdByDisplayNodeId.get(sourceDisplayId);
			if (!sourceTargetId) {
				throw new Error(
					`input.channel node ${node.id} references unknown display "${sourceDisplayId}"`
				);
			}
			const existing = byChannel.get(channel);
			if (existing && existing !== sourceTargetId) {
				throw new Error(
					`Pass "${pass.targetId}" has conflicting sources for channel ${channel}: ` +
						`"${existing}" vs "${sourceTargetId}"`
				);
			}
			if (!existing) {
				byChannel.set(channel, sourceTargetId);
				dependencies.push({
					consumerId: pass.targetId,
					channel,
					sourceTargetId
				});
			}
		}
	}

	return dependencies;
}

export function buildPassGraphWithChannelReads(
	passes: readonly GraphFramePass[],
	dependencies: readonly ChannelDependency[]
): PassGraph {
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
			reads: dependencies
				.filter((dependency) => dependency.consumerId === pass.targetId)
				.map((dependency) => ({
					channel: dependency.channel,
					target: dependency.sourceTargetId
				}))
		})),
		display: passes[0]?.targetId ?? '',
		readbackTargets: passes.map((pass) => pass.targetId)
	};
}

export { parseChannelIndex } from './graphReachability.js';
