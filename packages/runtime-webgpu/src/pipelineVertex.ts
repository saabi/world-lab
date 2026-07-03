import type { GraphDocument } from '@world-lab/graph';
import {
	DEFAULT_PIPELINE_GEOMETRY_PARAMS,
	planeGridVertexCount,
	type PipelineGeometryParams
} from '@world-lab/graph';

import type { PipelineGraphPlan } from './pipelineGraph.js';

export { planeGridVertexCount };

export { DEFAULT_PIPELINE_GEOMETRY_PARAMS, type PipelineGeometryParams };

function numParam(params: Record<string, unknown>, key: keyof PipelineGeometryParams, fallback: number): number {
	return typeof params[key] === 'number' ? (params[key] as number) : fallback;
}

/** Resolve geometry grid params from the wired geometry source node. */
export function resolvePipelineGeometryParams(
	doc: GraphDocument,
	plan: PipelineGraphPlan
): PipelineGeometryParams {
	const geometryNode = doc.nodes.find((node) => node.id === plan.geometryNode);
	const params = geometryNode?.params ?? {};
	return {
		resU: numParam(params, 'resU', DEFAULT_PIPELINE_GEOMETRY_PARAMS.resU),
		resV: numParam(params, 'resV', DEFAULT_PIPELINE_GEOMETRY_PARAMS.resV),
		width: numParam(params, 'width', DEFAULT_PIPELINE_GEOMETRY_PARAMS.width),
		height: numParam(params, 'height', DEFAULT_PIPELINE_GEOMETRY_PARAMS.height),
		rotationX: numParam(params, 'rotationX', DEFAULT_PIPELINE_GEOMETRY_PARAMS.rotationX),
		rotationY: numParam(params, 'rotationY', DEFAULT_PIPELINE_GEOMETRY_PARAMS.rotationY),
		rotationZ: numParam(params, 'rotationZ', DEFAULT_PIPELINE_GEOMETRY_PARAMS.rotationZ)
	};
}

/** @deprecated Use {@link resolvePipelineGeometryParams}. */
export function resolvePipelineGeometryResolution(
	doc: GraphDocument,
	plan: PipelineGraphPlan
): { resU: number; resV: number } {
	const geo = resolvePipelineGeometryParams(doc, plan);
	return { resU: geo.resU, resV: geo.resV };
}

function formatWgslFloat(value: number): string {
	return Number.isInteger(value) ? `${value}.0` : String(value);
}

/** Node-driven @vertex entry calling `plane_grid_position` for the wired geometry grid. */
export function assemblePipelineVertexWgsl(
	geo: PipelineGeometryParams,
	planeModuleSource: string
): string {
	const width = formatWgslFloat(geo.width);
	const height = formatWgslFloat(geo.height);
	const rotationX = formatWgslFloat(geo.rotationX);
	const rotationY = formatWgslFloat(geo.rotationY);
	const rotationZ = formatWgslFloat(geo.rotationZ);
	return `${planeModuleSource.trim()}

struct VSOut {
	@builtin(position) position: vec4f,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VSOut {
	var out: VSOut;
	let p = plane_grid_position(vid, ${geo.resU}u, ${geo.resV}u, ${width}, ${height}, ${rotationX}, ${rotationY}, ${rotationZ});
	out.position = vec4f(p, 1.0);
	return out;
}`;
}
