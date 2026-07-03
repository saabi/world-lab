import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { planetRadiusParam, pureParam, ratioRParam, scaleMppInput } from './_params.js';
import { PLANET_SPACES } from './spaces.js';

const fineTextureNoise: NodePrimitiveInput = {
	id: 'terrain.fineTextureNoise',
	category: 'terrain',
	inputs: [
		{ name: 'unit_dir', dataType: 'vec3f', space: PLANET_SPACES.BODY_DIRECTION },
		scaleMppInput
	],
	outputs: [{ name: 'texture_offset', dataType: 'f32', space: PLANET_SPACES.HEIGHT_METERS }],
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
