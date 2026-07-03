export interface PipelineGeometryParams {
	resU: number;
	resV: number;
	width: number;
	height: number;
	rotationX: number;
	rotationY: number;
	rotationZ: number;
}

export const DEFAULT_PIPELINE_GEOMETRY_PARAMS: PipelineGeometryParams = {
	resU: 2,
	resV: 2,
	width: 2,
	height: 2,
	rotationX: 0,
	rotationY: 0,
	rotationZ: 0
};
