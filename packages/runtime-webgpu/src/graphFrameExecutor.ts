import type { GraphDocument } from '@virtual-planet/graph';
import type { WgslModuleResolver } from '@virtual-planet/compiler';

import type { ShaderToyHostInputs } from './consumers/fullscreenFragment.js';
import { planIndependentGraphFramePasses } from './graphFramePlan.js';
import { PipelineGraphExecutor } from './pipelineGraph.js';

export type PreviewPointer = [number, number, number, number];

export interface GraphFrameHost {
	iTime: number;
	iFrame: number;
	pointers: Readonly<Record<string, PreviewPointer>>;
}

export interface GraphFrameExecuteInput {
	device: GPUDevice;
	graph: GraphDocument;
	width: number;
	height: number;
	host: GraphFrameHost;
	resolver?: WgslModuleResolver;
}

export interface GraphFrameExecuteResult {
	width: number;
	height: number;
	targets: Record<string, Uint8Array>;
}

/** Runs all independent pipeline targets in one frame with shared ShaderToy host uniforms. */
export class GraphFrameExecutor {
	private readonly pipeline = new PipelineGraphExecutor();

	async execute(input: GraphFrameExecuteInput): Promise<GraphFrameExecuteResult> {
		const passes = planIndependentGraphFramePasses(input.graph);
		const targets: Record<string, Uint8Array> = {};

		for (const pass of passes) {
			const host: ShaderToyHostInputs = {
				iTime: input.host.iTime,
				iFrame: input.host.iFrame,
				iMouse: input.host.pointers[pass.targetId] ?? [0, 0, 0, 0]
			};
			const result = await this.pipeline.execute({
				device: input.device,
				graph: input.graph,
				output: pass.fieldOutput,
				resolver: input.resolver,
				width: input.width,
				height: input.height,
				host
			});
			targets[pass.targetId] = result.pixels;
		}

		return { width: input.width, height: input.height, targets };
	}
}
