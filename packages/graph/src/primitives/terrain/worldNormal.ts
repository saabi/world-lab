import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { PLANET_SPACES } from './spaces.js';

const worldNormal: NodePrimitiveInput = {
	id: 'terrain.worldNormal',
	category: 'terrain',
	inputs: [
		{ name: 'body_normal', dataType: 'vec3f', space: PLANET_SPACES.BODY_DIRECTION },
		{ name: 'planet_rot', dataType: 'vec4f' }
	],
	outputs: [{ name: 'normal', dataType: 'vec3f', space: PLANET_SPACES.WORLD_DIRECTION }],
	params: Type.Object({}),
	wgsl: { moduleId: 'terrain.worldNormal', entry: 'worldNormal' },
	metadata: {
		keywords: ['Domain', 'Terrain'],
		help: 'World-space shading normal derived from body direction.'
	}
};

registerPrimitive(worldNormal);
