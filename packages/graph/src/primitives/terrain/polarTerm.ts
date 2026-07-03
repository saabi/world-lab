import { Type } from '@world-lab/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { planetRadiusParam, pureParam, ratioRParam, scaleMppInput } from './_params.js';
import { PLANET_SPACES } from './spaces.js';

const polarTerm: NodePrimitive = {
	id: 'terrain.polarTerm',
	category: 'terrain',
	inputs: [
		{ name: 'world_pos', dataType: 'vec3f', space: PLANET_SPACES.WORLD_POSITION },
		scaleMppInput
	],
	outputs: [{ name: 'polar_offset', dataType: 'f32', space: PLANET_SPACES.HEIGHT_METERS }],
	params: Type.Object({
		polar_scale: pureParam(0),
		polar_amplitude: ratioRParam(0),
		radius: planetRadiusParam
	}),
	wgsl: { moduleId: 'terrain.polarTerm', entry: 'polarTerm' },
	metadata: {
		keywords: ['Domain', 'Terrain'],
		help: 'Polar-cap latitude shaping term for planetary height.'
	}
};

registerPrimitive(polarTerm);
