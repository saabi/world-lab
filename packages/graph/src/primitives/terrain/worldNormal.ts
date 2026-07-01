import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const worldNormal: NodePrimitive = {
	id: 'terrain.worldNormal',
	category: 'terrain',
	inputs: [
		{ name: 'body_normal', dataType: 'vec3f', space: 'body_dir' },
		{ name: 'planet_rot', dataType: 'vec4f' }
	],
	outputs: [{ name: 'normal', dataType: 'vec3f', space: 'world_dir' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'terrain.worldNormal', entry: 'worldNormal' },
	metadata: {
		keywords: ['Domain', 'Terrain'],
		help: 'World-space shading normal derived from body direction.'
	}
};

registerPrimitive(worldNormal);
