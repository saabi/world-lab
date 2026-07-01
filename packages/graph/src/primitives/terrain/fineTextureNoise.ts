import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { planetRadiusParam, pureParam, ratioRParam, scaleMppInput } from './_params.js';

const fineTextureNoise: NodePrimitive = {
	id: 'terrain.fineTextureNoise',
	category: 'terrain',
	inputs: [
		{ name: 'unit_dir', dataType: 'vec3f', space: 'body_dir' },
		scaleMppInput
	],
	outputs: [{ name: 'texture_offset', dataType: 'f32', space: 'height_meters' }],
	params: Type.Object({
		texture_noise_scale: pureParam(1),
		texture_noise_amplitude: ratioRParam(0.001),
		radius: planetRadiusParam
	}),
	wgsl: { moduleId: 'terrain.fineTextureNoise', entry: 'fineTextureNoise' },
	metadata: {
		keywords: ['Domain', 'Terrain'],
		help: 'High-frequency noise for fine planetary surface detail.'
	}
};

registerPrimitive(fineTextureNoise);
