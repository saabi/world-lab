import { Type } from '@world-lab/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { freqParam, planetRadiusParam, pureParam, scaleMppInput } from './_params.js';
import { PLANET_SPACES } from './spaces.js';

const voronoi: NodePrimitive = {
	id: 'terrain.voronoi',
	category: 'terrain',
	inputs: [
		{ name: 'unit_dir', dataType: 'vec3f', space: PLANET_SPACES.BODY_DIRECTION },
		{ name: 'distortion', dataType: 'f32' },
		scaleMppInput
	],
	outputs: [{ name: 'vor', dataType: 'vec3f' }],
	params: Type.Object({
		voronoi_scale: freqParam(1),
		voronoi_distortion_amplitude: pureParam(0),
		radius: planetRadiusParam
	}),
	wgsl: { moduleId: 'terrain.voronoi', entry: 'voronoi' },
	metadata: {
		keywords: ['Domain', 'Terrain'],
		help: '3D Voronoi feature on unit-sphere direction for terrain macro structure.'
	}
};

registerPrimitive(voronoi);
