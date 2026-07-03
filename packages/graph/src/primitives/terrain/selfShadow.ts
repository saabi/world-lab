import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { planetRadiusParam, pureParam, ratioRParam } from './_params.js';
import { PLANET_SPACES } from './spaces.js';

const selfShadow: NodePrimitiveInput = {
	id: 'terrain.selfShadow',
	category: 'terrain',
	inputs: [
		{ name: 'surface_pos', dataType: 'vec3f', space: PLANET_SPACES.WORLD_POSITION },
		{ name: 'sun_dir', dataType: 'vec3f', space: PLANET_SPACES.WORLD_DIRECTION },
		{ name: 'meters_per_pixel', dataType: 'f32', space: PLANET_SPACES.SCALE_CONTEXT },
		{ name: 'planet_rot', dataType: 'vec4f' }
	],
	outputs: [{ name: 'shadow', dataType: 'f32' }],
	params: Type.Object({
		radius: planetRadiusParam,
		voronoi_scale: Type.Number({ default: 1 }),
		voronoi_amplitude: ratioRParam(0.01),
		voronoi_distortion_scale: Type.Number({ default: 0 }),
		voronoi_distortion_amplitude: Type.Number({ default: 0 }),
		detail_amplitude: ratioRParam(0.01),
		water_level: pureParam(0.5),
		erosion: pureParam(1),
		softness: pureParam(0.5),
		step_count: Type.Number({ default: 16 })
	}),
	wgsl: { moduleId: 'terrain.selfShadow', entry: 'selfShadow' },
	metadata: {
		keywords: ['Domain', 'Terrain', 'Effects'],
		help: 'Cheap self-shadowing term from light direction and surface normal.'
	}
};

registerPrimitive(selfShadow);
