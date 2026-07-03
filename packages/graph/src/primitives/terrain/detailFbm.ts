import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { freqParam, planetRadiusParam, scaleMppInput } from './_params.js';
import { PLANET_SPACES } from './spaces.js';

const detailFbm: NodePrimitiveInput = {
	id: 'terrain.detailFbm',
	category: 'terrain',
	inputs: [
		{ name: 'unit_dir', dataType: 'vec3f', space: PLANET_SPACES.BODY_DIRECTION },
		scaleMppInput
	],
	outputs: [{ name: 'detail', dataType: 'f32' }],
	params: Type.Object({
		detail_scale: freqParam(1),
		radius: planetRadiusParam
	}),
	wgsl: { moduleId: 'terrain.detailFbm', entry: 'detailFbm' },
	metadata: {
		keywords: ['Domain', 'Terrain'],
		help: 'Detail-scale FBM layer for fine surface texture.'
	}
};

registerPrimitive(detailFbm);
