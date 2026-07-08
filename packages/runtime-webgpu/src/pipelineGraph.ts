import type { GraphDocument, Node, PortRef } from '@world-lab/graph';
import {
	derivePipelinePresentations,
	discoverExecutionRoots,
	getPrimitive,
	isPipelineStage,
	isPipelineTarget,
	validateGraph
} from '@world-lab/graph';
import type { WgslModuleResolver } from '@world-lab/compiler';

import {
	executeFullscreenFragment,
	type FullscreenFragmentResult,
	type ShaderToyHostInputs
} from './consumers/fullscreenFragment.js';
import {
	executeKernelFragment,
	type KernelFragmentBindingInput
} from './consumers/kernelFragment.js';

const PIPELINE_GEOMETRY_SOURCE_ROLE = 'pipelineGeometrySource';

export interface PipelineGraphPlan {
	geometryNode: string;
	geometryPrimitive: string;
	persistNode: string;
	vertexStageNode: string;
	fragmentStageNode: string;
	displayTargetNode: string;
	fieldOutput: PortRef;
}

export interface PlanPipelineGraphOptions {
	/** Field colour port to render (the fragment stage `color` input source). */
	output?: PortRef;
	/** Display sink node id — alternative to `output`. */
	displayNodeId?: string;
}

export interface PipelineGraphInput {
	device: GPUDevice;
	graph: GraphDocument;
	/** When set, render this field instead of the first pipeline display target. */
	output?: PortRef;
	resolver?: WgslModuleResolver;
	width: number;
	height: number;
	host: ShaderToyHostInputs;
	target: GPUTexture;
	channelTargets?: ReadonlyMap<number, GPUTexture>;
	/** Required only when the discovered fragment stage is a {kind:'kernel'} primitive. */
	kernelFragmentBindings?: KernelFragmentBindingInput;
}

/** Stable cache identity for geometry realized through `buffer.persist`. */
export function geometryCacheFingerprint(doc: GraphDocument, plan: PipelineGraphPlan): string {
	const geometryNode = doc.nodes.find((node) => node.id === plan.geometryNode);
	const params = geometryNode?.params ?? {};
	const paramKeys = Object.keys(params).sort();
	const paramsKey = JSON.stringify(params, paramKeys);
	return `${plan.persistNode}:${plan.geometryNode}:${plan.geometryPrimitive}:${paramsKey}`;
}

export class PipelineGraphResourceCache {
	readonly geometry = new Set<string>();
	geometryRealizations = 0;

	realizeGeometry(cacheKey: string): void {
		if (this.geometry.has(cacheKey)) return;
		this.geometry.add(cacheKey);
		this.geometryRealizations++;
	}
}

function incoming(doc: GraphDocument, node: string, port: string) {
	return doc.edges.find((edge) => edge.to.node === node && edge.to.port === port);
}

function requireEdge(doc: GraphDocument, from: PortRef, to: PortRef): void {
	const edge = doc.edges.find(
		(candidate) =>
			candidate.from.node === from.node &&
			candidate.from.port === from.port &&
			candidate.to.node === to.node &&
			candidate.to.port === to.port
	);
	if (!edge) {
		throw new Error(
			`Pipeline graph is missing edge ${from.node}.${from.port} -> ${to.node}.${to.port}`
		);
	}
}

function findPipelineGeometrySource(doc: GraphDocument, persist: Node): Node {
	const inEdge = incoming(doc, persist.id, 'in');
	if (!inEdge) {
		throw new Error('buffer.persist is missing its geometry input');
	}
	if (inEdge.from.port !== 'mesh') {
		throw new Error('Pipeline geometry source must connect via the mesh port');
	}

	const geometry = doc.nodes.find((candidate) => candidate.id === inEdge.from.node);
	if (!geometry) {
		throw new Error(`Pipeline graph references missing geometry node ${inEdge.from.node}`);
	}

	const primitive = getPrimitive(geometry.primitive);
	if (primitive?.metadata?.role !== PIPELINE_GEOMETRY_SOURCE_ROLE) {
		throw new Error(
			`Pipeline geometry source must use role ${PIPELINE_GEOMETRY_SOURCE_ROLE}, got ${geometry.primitive}`
		);
	}

	return geometry;
}

function portRefKey(ref: PortRef): string {
	return `${ref.node}:${ref.port}`;
}

function resolveVertexForFragment(doc: GraphDocument, fragmentStageNode: string): Node {
	const varyingsEdge = incoming(doc, fragmentStageNode, 'varyings');
	if (!varyingsEdge) {
		throw new Error(`Pipeline fragment ${fragmentStageNode} is missing its varyings input`);
	}
	const vertex = doc.nodes.find((candidate) => candidate.id === varyingsEdge.from.node);
	if (!vertex || !isPipelineStage(vertex, 'vertex')) {
		throw new Error(`Pipeline graph is missing a vertex stage for fragment ${fragmentStageNode}`);
	}
	return vertex;
}

function resolvePipelineTarget(
	doc: GraphDocument,
	options: PlanPipelineGraphOptions = {}
): { displayTargetNode: string; fragmentStageNode: string; fieldOutput: PortRef } {
	if (options.output || options.displayNodeId) {
		const presentations = derivePipelinePresentations(doc);
		const match = options.displayNodeId
			? presentations.find((candidate) => candidate.displayNodeId === options.displayNodeId)
			: presentations.find(
					(candidate) => portRefKey(candidate.fieldOutput) === portRefKey(options.output!)
				);

		if (match) {
			const toDisplay = incoming(doc, match.displayNodeId, 'color');
			if (!toDisplay || toDisplay.from.port !== 'texture') {
				throw new Error(`Pipeline display ${match.displayNodeId} is missing its fragment texture input`);
			}
			return {
				displayTargetNode: match.displayNodeId,
				fragmentStageNode: toDisplay.from.node,
				fieldOutput: match.fieldOutput
			};
		}

		if (options.output) {
			const colorEdge = doc.edges.find(
				(edge) =>
					edge.to.port === 'color' && portRefKey(edge.from) === portRefKey(options.output!)
			);
			if (!colorEdge) {
				throw new Error(`No pipeline fragment consumes output ${portRefKey(options.output)}`);
			}
			const displayEdge = doc.edges.find(
				(edge) => edge.from.node === colorEdge.to.node && edge.from.port === 'texture'
			);
			if (!displayEdge) {
				throw new Error(`Pipeline fragment ${colorEdge.to.node} is not wired to a display target`);
			}
			return {
				displayTargetNode: displayEdge.to.node,
				fragmentStageNode: colorEdge.to.node,
				fieldOutput: options.output
			};
		}

		throw new Error(`No pipeline presentation for display ${options.displayNodeId}`);
	}

	const presentation = derivePipelinePresentations(doc)[0];
	if (presentation) {
		const toDisplay = incoming(doc, presentation.displayNodeId, 'color');
		if (!toDisplay || toDisplay.from.port !== 'texture') {
			throw new Error(`Pipeline display ${presentation.displayNodeId} is missing its fragment texture input`);
		}
		return {
			displayTargetNode: presentation.displayNodeId,
			fragmentStageNode: toDisplay.from.node,
			fieldOutput: presentation.fieldOutput
		};
	}

	const display = discoverExecutionRoots(doc).find(isPipelineTarget);
	if (!display) {
		throw new Error('Pipeline graph is missing target.display execution root');
	}
	const toDisplay = incoming(doc, display.id, 'color');
	if (!toDisplay || toDisplay.from.port !== 'texture') {
		throw new Error('Pipeline display is missing its fragment texture input');
	}
	const fragmentStageNode = toDisplay.from.node;
	const fieldEdge = incoming(doc, fragmentStageNode, 'color');
	if (!fieldEdge) {
		throw new Error('Pipeline graph fragment stage is missing its field color input');
	}
	return {
		displayTargetNode: display.id,
		fragmentStageNode,
		fieldOutput: fieldEdge.from
	};
}

export function planPipelineGraph(
	doc: GraphDocument,
	options: PlanPipelineGraphOptions = {}
): PipelineGraphPlan {
	const validation = validateGraph(doc);
	if (!validation.ok) {
		throw new Error(`Pipeline graph failed validation: ${validation.issues[0]?.kind ?? 'unknown'}`);
	}

	const target = resolvePipelineTarget(doc, options);
	const vertex = resolveVertexForFragment(doc, target.fragmentStageNode);
	const persistEdge = incoming(doc, vertex.id, 'mesh');
	const persist = persistEdge
		? doc.nodes.find((candidate) => candidate.id === persistEdge.from.node)
		: undefined;
	if (!persist || persist.primitive !== 'buffer.persist') {
		throw new Error(`Pipeline graph is missing buffer.persist for vertex ${vertex.id}`);
	}
	const geometry = findPipelineGeometrySource(doc, persist);
	const fragment = doc.nodes.find((candidate) => candidate.id === target.fragmentStageNode);
	if (!fragment || !isPipelineStage(fragment, 'fragment')) {
		throw new Error(`Pipeline graph is missing a fragment stage for display ${target.displayTargetNode}`);
	}

	requireEdge(doc, { node: geometry.id, port: 'mesh' }, { node: persist.id, port: 'in' });
	requireEdge(doc, { node: persist.id, port: 'out' }, { node: vertex.id, port: 'mesh' });
	requireEdge(doc, { node: vertex.id, port: 'varyings' }, { node: fragment.id, port: 'varyings' });
	requireEdge(
		doc,
		{ node: fragment.id, port: 'texture' },
		{ node: target.displayTargetNode, port: 'color' }
	);
	requireEdge(doc, target.fieldOutput, { node: fragment.id, port: 'color' });

	return {
		geometryNode: geometry.id,
		geometryPrimitive: geometry.primitive,
		persistNode: persist.id,
		vertexStageNode: vertex.id,
		fragmentStageNode: fragment.id,
		displayTargetNode: target.displayTargetNode,
		fieldOutput: target.fieldOutput
	};
}

export class PipelineGraphExecutor {
	readonly cache = new PipelineGraphResourceCache();

	async execute(input: PipelineGraphInput): Promise<FullscreenFragmentResult> {
		const plan = planPipelineGraph(
			input.graph,
			input.output ? { output: input.output } : {}
		);
		this.cache.realizeGeometry(geometryCacheFingerprint(input.graph, plan));

		const fragmentNode = input.graph.nodes.find((node) => node.id === plan.fragmentStageNode);
		const fragmentImpl = fragmentNode
			? getPrimitive(fragmentNode.primitive)?.implementation
			: undefined;
		if (fragmentImpl?.kind === 'kernel' && fragmentImpl.stage === 'fragment') {
			if (!input.kernelFragmentBindings) {
				throw new Error(
					`Pipeline fragment stage ${plan.fragmentStageNode} is a kernel-based primitive but no ` +
						'kernelFragmentBindings were supplied'
				);
			}
			return executeKernelFragment({
				device: input.device,
				graph: input.graph,
				output: plan.fieldOutput,
				bindings: fragmentImpl.bindings,
				resolver: input.resolver,
				width: input.width,
				height: input.height,
				target: input.target,
				kernelBindings: input.kernelFragmentBindings
			});
		}

		return executeFullscreenFragment({
			device: input.device,
			graph: input.graph,
			output: plan.fieldOutput,
			resolver: input.resolver,
			width: input.width,
			height: input.height,
			host: input.host,
			target: input.target,
			channelTargets: input.channelTargets
		});
	}
}

export async function executePipelineGraph(input: PipelineGraphInput): Promise<FullscreenFragmentResult> {
	const executor = new PipelineGraphExecutor();
	return executor.execute(input);
}
