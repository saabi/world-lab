import { Type } from '@world-lab/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { PLANET_SPACES } from './spaces.js';

const pbrLighting: NodePrimitive = {
	id: 'material.pbrLighting',
	category: 'material',
	inputs: [
		{ name: 'albedo', dataType: 'vec3f' },
		{ name: 'roughness', dataType: 'f32' },
		{ name: 'metallic', dataType: 'f32' },
		{ name: 'ior', dataType: 'f32' },
		{ name: 'normal', dataType: 'vec3f', space: PLANET_SPACES.WORLD_DIRECTION },
		{ name: 'view', dataType: 'vec3f', space: PLANET_SPACES.WORLD_DIRECTION },
		{ name: 'surface_pos', dataType: 'vec3f', space: PLANET_SPACES.WORLD_POSITION },
		{ name: 'sun_shadow', dataType: 'f32' }
	],
	outputs: [{ name: 'color', dataType: 'vec3f' }],
	params: Type.Object({
		exposure: Type.Number({ default: 1 })
	}),
	wgsl: { moduleId: 'material.pbrLighting', entry: 'pbrLighting' },
	metadata: {
		keywords: ['Domain', 'Material', 'Effects'],
		help: 'PBR sun/sky lighting term for terrain shading.'
	}
};

registerPrimitive(pbrLighting);
