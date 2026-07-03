import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { planeGridMeshPositions } from './planeGrid.js';
import { fullscreenPlaneParams } from './plane.js';

/** Back-compat alias for a 2x2 `geometry.plane` used by saved S0 fullscreen graphs. */
const fullscreenPlane: NodePrimitiveInput = {
	id: 'geometry.fullscreenPlane',
	category: 'geometry/source',
	inputs: [],
	outputs: [{ name: 'mesh', dataType: 'geometry', metadata: { semantic: 'plane-grid' } }],
	params: fullscreenPlaneParams,
	implementation: { kind: 'legacy-structural', marker: 'geometry.fullscreenPlane' },
	evalCPU(ctx) {
		const resU = typeof ctx.params.resU === 'number' ? ctx.params.resU : 2;
		const resV = typeof ctx.params.resV === 'number' ? ctx.params.resV : 2;
		return { mesh: planeGridMeshPositions(resU, resV) };
	},
	metadata: {
		description: 'Compatibility alias for a 2x2 fullscreen plane geometry source.',
		help: 'Equivalent to geometry.plane with { resU: 2, resV: 2 }. New graphs should use geometry.plane directly.',
		keywords: ['compatibility', 'fullscreen', 'plane'],
		pure: true,
		deterministic: true,
		role: 'pipelineGeometrySource'
	}
};

registerPrimitive(fullscreenPlane);
