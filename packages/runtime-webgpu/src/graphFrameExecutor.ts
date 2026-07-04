import type { GraphDocument } from '@world-lab/graph';
import type { WgslModuleResolver } from '@world-lab/compiler';

import type { ShaderToyHostInputs } from './consumers/fullscreenFragment.js';
import { buildPassOrder } from './frameGraph/order.js';
import { ResourceRealizer } from './frameGraph/realize.js';
import {
	buildIndependentPassGraph,
	planIndependentGraphFramePasses
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
		this.realizer = undefined;
		this.realizerDevice = undefined;
	}

	async execute(input: GraphFrameExecuteInput): Promise<GraphFrameExecuteResult> {
		const passes = planIndependentGraphFramePasses(input.graph);
		const passGraph = buildIndependentPassGraph(passes);
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
			const result = await this.pipeline.execute({
				device: input.device,
				graph: input.graph,
				output: pass.fieldOutput,
				resolver: input.resolver,
				width: input.width,
				height: input.height,
				host,
				target: realizer.resolve(pass.targetId).write as GPUTexture
			});
			targets[pass.targetId] = result.pixels;
		}

		realizer.advanceFrame();
		return { width: input.width, height: input.height, targets };
	}
}
