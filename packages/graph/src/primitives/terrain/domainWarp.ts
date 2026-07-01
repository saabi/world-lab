import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { freqParam, planetRadiusParam, scaleMppInput } from './_params.js';

const domainWarp: NodePrimitive = {
	id: 'terrain.domainWarp',
	category: 'terrain',
	inputs: [
		{ name: 'unit_dir', dataType: 'vec3f', space: 'body_dir' },
		scaleMppInput
	],
	outputs: [{ name: 'distortion', dataType: 'f32' }],
	params: Type.Object({
		voronoi_distortion_scale: freqParam(0),
		radius: planetRadiusParam
	}),
	wgsl: { moduleId: 'terrain.domainWarp', entry: 'domainWarp' },
	metadata: {
		keywords: ['Domain', 'Terrain'],
		help: 'Domain-warp terrain coordinates by offset noise.'
	}
};

registerPrimitive(domainWarp);
