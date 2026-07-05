import {
	deriveBufferFeedbackTarget,
	type GraphDocument
} from '@world-lab/graph';
import type { WgslModuleResolver } from '@world-lab/compiler';

import type { ShaderToyHostInputs } from './consumers/fullscreenFragment.js';
import { BufferFeedbackExecutor } from './consumers/bufferFeedback.js';
import { buildPassOrder } from './frameGraph/order.js';
import { ResourceRealizer } from './frameGraph/realize.js';
import {
	buildIndependentPassGraph,
	buildPassGraphWithChannelReads,
	planIndependentGraphFramePasses,
	resolveChannelDependencies
} from './graphFramePlan.js';
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
	private readonly bufferFeedback = new BufferFeedbackExecutor();
	private realizer: ResourceRealizer | undefined;
	private realizerDevice: GPUDevice | undefined;

	private realizerFor(device: GPUDevice): ResourceRealizer {
		if (this.realizerDevice !== device || !this.realizer) {
			this.realizer?.dispose();
			this.realizer = new ResourceRealizer(device);
			this.realizerDevice = device;
		}
		return this.realizer;
	}

	dispose(): void {
		this.realizer?.dispose();
		this.bufferFeedback.dispose();
		this.realizer = undefined;
		this.realizerDevice = undefined;
	}

	async execute(input: GraphFrameExecuteInput): Promise<GraphFrameExecuteResult> {
		const bufferTarget = deriveBufferFeedbackTarget(input.graph);
		if (
			bufferTarget &&
			(bufferTarget.gridWidth !== input.width || bufferTarget.gridHeight !== input.height)
		) {
			throw new Error(
				`target.bufferFeedback grid (${bufferTarget.gridWidth}x${bufferTarget.gridHeight}) ` +
					`must match the frame viewport (${input.width}x${input.height})`
			);
		}
		const passes = planIndependentGraphFramePasses(input.graph);
		const channelDependencies = resolveChannelDependencies(input.graph, passes);
		const passGraph =
			channelDependencies.length === 0
				? buildIndependentPassGraph(passes)
				: buildPassGraphWithChannelReads(passes, channelDependencies);
		const order = buildPassOrder(passGraph);
		const realizer = this.realizerFor(input.device);
		realizer.realizeAll(passGraph, { width: input.width, height: input.height });

		const planPassByConsumerId = new Map(
			passGraph.passes.map((pass) => [pass.consumerId, pass])
		);
		const framePassByTargetId = new Map(passes.map((pass) => [pass.targetId, pass]));
		const targets: Record<string, Uint8Array> = {};

		for (const consumerId of order.order) {
			const planPass = planPassByConsumerId.get(consumerId);
			if (!planPass) {
				throw new Error(`buildPassOrder returned unknown consumer "${consumerId}"`);
			}
			const pass = framePassByTargetId.get(planPass.writeTarget);
			if (!pass) {
				throw new Error(
					`Pass "${consumerId}" writes target "${planPass.writeTarget}" with no matching GraphFramePass`
				);
			}
			const host: ShaderToyHostInputs = {
				iTime: input.host.iTime,
				iFrame: input.host.iFrame,
				iMouse: input.host.pointers[pass.targetId] ?? [0, 0, 0, 0]
			};
			const channelTargets = new Map<number, GPUTexture>();
			for (const dependency of channelDependencies) {
				if (dependency.consumerId !== consumerId) continue;
				channelTargets.set(
					dependency.channel,
					realizer.resolve(dependency.sourceTargetId).write as GPUTexture
				);
			}
			const result = await this.pipeline.execute({
				device: input.device,
				graph: input.graph,
				output: pass.fieldOutput,
				resolver: input.resolver,
				width: input.width,
				height: input.height,
				host,
				target: realizer.resolve(pass.targetId).write as GPUTexture,
				...(channelTargets.size > 0 ? { channelTargets } : {})
			});
			targets[pass.targetId] = result.pixels;
		}

		realizer.advanceFrame();
		if (bufferTarget) {
			const result = await this.bufferFeedback.execute(
				input.device,
				bufferTarget.gridWidth,
				bufferTarget.gridHeight
			);
			targets[bufferTarget.sinkNodeId] = result.pixels;
		}
		return { width: input.width, height: input.height, targets };
	}
}
