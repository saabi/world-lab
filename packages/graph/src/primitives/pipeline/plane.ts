import { quantity, Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import {
	DEFAULT_PLANE_GRID_TRANSFORM,
	type PlaneGridTransform,
	planeGridMeshPositions
} from './planeGrid.js';

function createPlaneParams(defaultResU = 16, defaultResV = 16) {
	return Type.Object({
		resU: quantity('none', {
			integer: true,
			min: 2,
			default: defaultResU,
			description: 'Subdivisions along U'
		}),
		resV: quantity('none', {
			integer: true,
			min: 2,
			default: defaultResV,
			description: 'Subdivisions along V'
		}),
		width: quantity('none', {
			default: 2,
			min: 0.0001,
			description: 'Plane width in local units (default 2 → [-1, 1] extent)'
		}),
		height: quantity('none', {
			default: 2,
			min: 0.0001,
			description: 'Plane height in local units (default 2 → [-1, 1] extent)'
		}),
		rotationX: Type.Number({
			default: 0,
			description: 'Euler X rotation in radians (applied before Y, then Z)'
		}),
		rotationY: Type.Number({
			default: 0,
			description: 'Euler Y rotation in radians'
		}),
		rotationZ: Type.Number({
			default: 0,
			description: 'Euler Z rotation in radians'
		})
	});
}

function planeTransformFromParams(params: Record<string, unknown>): PlaneGridTransform {
	return {
		width: typeof params.width === 'number' ? params.width : DEFAULT_PLANE_GRID_TRANSFORM.width,
		height: typeof params.height === 'number' ? params.height : DEFAULT_PLANE_GRID_TRANSFORM.height,
		rotationX:
			typeof params.rotationX === 'number' ? params.rotationX : DEFAULT_PLANE_GRID_TRANSFORM.rotationX,
		rotationY:
			typeof params.rotationY === 'number' ? params.rotationY : DEFAULT_PLANE_GRID_TRANSFORM.rotationY,
		rotationZ:
			typeof params.rotationZ === 'number' ? params.rotationZ : DEFAULT_PLANE_GRID_TRANSFORM.rotationZ
	};
}

const planeParams = createPlaneParams();
const fullscreenPlaneParams = createPlaneParams(2, 2);

/** Parametric resU×resV plane grid geometry source (instanceable). */
const plane: NodePrimitiveInput = {
	id: 'geometry.plane',
	category: 'geometry/source',
	inputs: [],
	outputs: [{ name: 'mesh', dataType: 'geometry', metadata: { semantic: 'plane-grid' } }],
	params: planeParams,
	wgsl: { moduleId: 'geometry.plane', entry: 'planeGrid' },
	evalCPU(ctx) {
		const resU = typeof ctx.params.resU === 'number' ? ctx.params.resU : 16;
		const resV = typeof ctx.params.resV === 'number' ? ctx.params.resV : 16;
		return { mesh: planeGridMeshPositions(resU, resV, planeTransformFromParams(ctx.params)) };
	},
	metadata: {
		description: 'Parametric resU×resV plane grid geometry source.',
		help: 'Generates a subdivided plane mesh grid. Instanceable (e.g. six faces for a cube). Use { resU: 2, resV: 2 } for a fixed 2-triangle fullscreen quad; legacy geometry.fullscreenPlane graphs resolve to this same plane-grid primitive. width/height default to 2 (clip [-1,1]); rotationX/Y/Z are Euler radians (default facing +Z).',
		keywords: ['instanceable', 'grid', 'tessellation'],
		pure: true,
		deterministic: true,
		role: 'pipelineGeometrySource'
	}
};

registerPrimitive(plane);

export { fullscreenPlaneParams, planeParams, planeTransformFromParams };
