import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { freqParam, planetRadiusParam, pureParam, scaleMppInput } from './_params.js';

const voronoi: NodePrimitive = {
	id: 'terrain.voronoi',
	category: 'terrain',
	inputs: [
		{ name: 'unit_dir', dataType: 'vec3f', space: 'body_dir' },
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
	metadata: { keywords: ['Domain', 'Terrain'] }
};

registerPrimitive(voronoi);
