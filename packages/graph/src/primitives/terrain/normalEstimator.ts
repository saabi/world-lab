import { Type } from '@world-lab/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { planetRadiusParam, scaleMppInput } from './_params.js';
import { PLANET_SPACES } from './spaces.js';

const normalEstimator: NodePrimitive = {
	id: 'terrain.normalEstimator',
	category: 'terrain',
	inputs: [
		{ name: 'unit_dir', dataType: 'vec3f', space: PLANET_SPACES.BODY_DIRECTION },
		scaleMppInput
	],
	outputs: [{ name: 'normal', dataType: 'vec3f', space: PLANET_SPACES.BODY_DIRECTION }],
	params: Type.Object({
		radius: planetRadiusParam,
		voronoi_scale: Type.Number({ default: 1 }),
		voronoi_amplitude: Type.Number({ default: 0.01 }),
		voronoi_distortion_scale: Type.Number({ default: 0 }),
		voronoi_distortion_amplitude: Type.Number({ default: 0 }),
		detail_scale: Type.Number({ default: 1 }),
		detail_amplitude: Type.Number({ default: 0.01 }),
		water_level: Type.Number({ default: 0.5 }),
		erosion: Type.Number({ default: 1 })
	}),
	wgsl: { moduleId: 'terrain.normalEstimator', entry: 'normalEstimator' },
	metadata: {
		keywords: ['Domain', 'Terrain'],
		help: 'Estimate surface normal from neighboring height samples.'
	}
};

registerPrimitive(normalEstimator);
