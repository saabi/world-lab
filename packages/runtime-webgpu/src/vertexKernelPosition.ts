import {
	assembleStageEntry,
	compileGraph,
	type VaryingDecl,
	type WgslModuleResolver
} from '@world-lab/compiler';
import {
	type GraphDocument,
	type PortRef
} from '@world-lab/graph';

import {
	buildParamsStructWgsl,
	emitGraphVec2Eval,
	emitGraphVec3Eval,
	type GraphParamField
} from './emitGraphEval.js';
import {
	DEFAULT_PIPELINE_GEOMETRY_PARAMS,
	planeGridVertexCount,
	type PipelineGeometryParams
} from './pipelineVertex.js';

export interface VertexKernelPositionInput {
	graph: GraphDocument;
	/** The vec3f-producing graph output feeding the vertex kernel's clip-space position. */
	output: PortRef;
	/** Optional vec2f-producing graph output for the `uv` varying. */
	uvOutput?: PortRef;
	geo?: PipelineGeometryParams;
	resolver: WgslModuleResolver;
}

export interface VertexKernelPositionAssembly {
	code: string;
	vertexCount: number;
	/** Empty when no varying output was supplied. */
	varyings: VaryingDecl[];
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

function buildVertexVaryingEvalFn(name: string, body: string[], resultExpr: string): string {
	return `fn graph_eval_${name}(vid: u32, iid: u32) -> vec2f {
${body.map((line) => `\t${line}`).join('\n')}
\treturn ${resultExpr};
}`;
}

function dedupeParams(params: readonly GraphParamField[]): GraphParamField[] {
	const seen = new Set<string>();
	const deduped: GraphParamField[] = [];
	for (const param of params) {
		if (seen.has(param.field)) continue;
		seen.add(param.field);
		deduped.push(param);
	}
	return deduped;
}

export async function assembleVertexKernelPositionModuleAsync(
	input: VertexKernelPositionInput
): Promise<VertexKernelPositionAssembly> {
	const geo = input.geo ?? DEFAULT_PIPELINE_GEOMETRY_PARAMS;
	const positionExpr = planeGridPositionExpr(geo);
	const planeModule = await input.resolver.resolve('geometry.plane');
	const outputNames = ['position', ...(input.uvOutput ? ['uv'] : [])];
	const compiled = await compileGraph(input.graph, input.resolver, {
		consumers: [
			{ type: 'image', id: 'vertex-kernel-position', stage: 'vertex', outputs: outputNames }
		]
	});
	const consumerShader = compiled.shaders[0];
	if (!consumerShader) {
		throw new Error('compileGraph produced no shaders');
	}

	const emitted = emitGraphVec3Eval(input.graph, input.output, {
		positionExpr
	});
	const uvEmitted = input.uvOutput
		? emitGraphVec2Eval(input.graph, input.uvOutput, { positionExpr })
		: undefined;
	const varyings: VaryingDecl[] = uvEmitted ? [{ name: 'uv', wgslType: 'vec2f' }] : [];
	const evalFn = buildVertexPositionEvalFn(emitted.body, emitted.resultExpr);
	const uvEvalFn = uvEmitted
		? buildVertexVaryingEvalFn('uv', uvEmitted.body, uvEmitted.resultExpr)
		: '';
	const params = dedupeParams([...emitted.params, ...(uvEmitted?.params ?? [])]);
	const paramsDecl =
		params.length > 0
			? `${buildParamsStructWgsl(params)}\n@group(0) @binding(0) var<uniform> params: GraphParams;`
			: '';
	const libraryWithEval = [planeModule.source.trim(), consumerShader.code, paramsDecl, evalFn, uvEvalFn]
		.filter((source) => source.length > 0)
		.join('\n\n');

	const stage = assembleStageEntry(
		{
			consumerId: 'vertex-kernel-position',
			stage: 'vertex',
			outputs: outputNames,
			code: libraryWithEval,
			moduleIds: consumerShader.moduleIds
		},
		{
			output: 'position',
			outputFns: {
				position: 'graph_eval_position',
				...(uvEmitted ? { uv: 'graph_eval_uv' } : {})
			},
			callArgs: ['vid', 'iid'],
			varyings
		}
	);

	return { code: stage.code, vertexCount: planeGridVertexCount(geo.resU, geo.resV), varyings };
}
