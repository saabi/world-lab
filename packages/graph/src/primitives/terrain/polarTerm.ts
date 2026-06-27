import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { planetRadiusParam, pureParam, ratioRParam, scaleMppInput } from './_params.js';

const polarTerm: NodePrimitive = {
	id: 'terrain.polarTerm',
	category: 'terrain',
	inputs: [
		{ name: 'world_pos', dataType: 'vec3f', space: 'world_pos' },
		scaleMppInput
	],
	outputs: [{ name: 'polar_offset', dataType: 'f32', space: 'height_meters' }],
	params: Type.Object({
		polar_scale: pureParam(0),
		polar_amplitude: ratioRParam(0),
		radius: planetRadiusParam
	}),
	wgsl: { moduleId: 'terrain.polarTerm', entry: 'polarTerm' },
	metadata: { keywords: ['Domain', 'Terrain'] }
};

registerPrimitive(polarTerm);
