import { assembleStageEntry, type WgslModuleResolver } from '@world-lab/compiler';
import {
	callableWgslSource,
	getPrimitive,
	type GraphDocument,
	type PortRef
} from '@world-lab/graph';

import { buildParamsStructWgsl, emitGraphVec3Eval } from './emitGraphEval.js';
import { upstreamNodeIds } from './graphReachability.js';
import {
	DEFAULT_PIPELINE_GEOMETRY_PARAMS,
	planeGridVertexCount,
	type PipelineGeometryParams
} from './pipelineVertex.js';

export interface VertexKernelPositionInput {
	graph: GraphDocument;
	/** The vec3f-producing graph output feeding the vertex kernel's clip-space position. */
	output: PortRef;
	geo?: PipelineGeometryParams;
	resolver: WgslModuleResolver;
}

export interface VertexKernelPositionAssembly {
	code: string;
	vertexCount: number;
}

function formatWgslFloat(value: number): string {
	return Number.isInteger(value) ? `${value}.0` : String(value);
}

function planeGridPositionExpr(geo: PipelineGeometryParams): string {
	return (
		`plane_grid_position(vid, ${geo.resU}u, ${geo.resV}u, ${formatWgslFloat(geo.width)}, ` +
		`${formatWgslFloat(geo.height)}, ${formatWgslFloat(geo.rotationX)}, ` +
		`${formatWgslFloat(geo.rotationY)}, ${formatWgslFloat(geo.rotationZ)})`
	);
}

function buildVertexPositionEvalFn(body: string[], resultExpr: string): string {
	return `fn graph_eval_position(vid: u32, iid: u32) -> vec4f {
${body.map((line) => `\t${line}`).join('\n')}
\treturn vec4f(${resultExpr}, 1.0);
}`;
}

async function graphModuleSources(
	graph: GraphDocument,
	output: PortRef,
	resolver: WgslModuleResolver
): Promise<string[]> {
	const moduleIds = new Set<string>();
	const emitted = new Set<string>();
	const sources: string[] = [];

	async function visit(moduleId: string): Promise<void> {
		if (moduleId === 'geometry.plane' || emitted.has(moduleId)) return;
		const module = await resolver.resolve(moduleId);
		for (const dependency of module.dependencies ?? []) {
			await visit(dependency);
		}
		if (emitted.has(moduleId)) return;
		emitted.add(moduleId);
		sources.push(module.source.trim());
	}

	for (const nodeId of upstreamNodeIds(graph, output.node)) {
		const node = graph.nodes.find((candidate) => candidate.id === nodeId);
		if (!node) continue;
		const primitive = getPrimitive(node.primitive);
		if (!primitive) continue;
		const source = callableWgslSource(primitive);
		if (source) moduleIds.add(source.moduleId);
	}

	for (const moduleId of moduleIds) {
		await visit(moduleId);
	}
	return sources;
}

export async function assembleVertexKernelPositionModuleAsync(
	input: VertexKernelPositionInput
): Promise<VertexKernelPositionAssembly> {
	const geo = input.geo ?? DEFAULT_PIPELINE_GEOMETRY_PARAMS;
	const planeModule = await input.resolver.resolve('geometry.plane');
	const dependencySources = await graphModuleSources(input.graph, input.output, input.resolver);

	const emitted = emitGraphVec3Eval(input.graph, input.output, {
		positionExpr: planeGridPositionExpr(geo)
	});
	const evalFn = buildVertexPositionEvalFn(emitted.body, emitted.resultExpr);
	const paramsDecl =
		emitted.params.length > 0
			? `${buildParamsStructWgsl(emitted.params)}\n@group(0) @binding(0) var<uniform> params: GraphParams;`
			: '';
	const libraryWithEval = [planeModule.source.trim(), ...dependencySources, paramsDecl, evalFn]
		.filter((source) => source.length > 0)
		.join('\n\n');

	const stage = assembleStageEntry(
		{
			consumerId: 'vertex-kernel-position',
			stage: 'vertex',
			outputs: ['position'],
			code: libraryWithEval,
			moduleIds: []
		},
		{ output: 'position', outputFns: { position: 'graph_eval_position' }, callArgs: ['vid', 'iid'] }
	);

	return { code: stage.code, vertexCount: planeGridVertexCount(geo.resU, geo.resV) };
}
