import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';

const pbrLighting: NodePrimitive = {
	id: 'material.pbrLighting',
	category: 'material',
	inputs: [
		{ name: 'albedo', dataType: 'vec3f' },
		{ name: 'roughness', dataType: 'f32' },
		{ name: 'metallic', dataType: 'f32' },
		{ name: 'ior', dataType: 'f32' },
		{ name: 'normal', dataType: 'vec3f', space: 'world_dir' },
		{ name: 'view', dataType: 'vec3f', space: 'world_dir' },
		{ name: 'surface_pos', dataType: 'vec3f', space: 'world_pos' },
		{ name: 'sun_shadow', dataType: 'f32' }
	],
	outputs: [{ name: 'color', dataType: 'vec3f' }],
	params: Type.Object({
		exposure: Type.Number({ default: 1 })
	}),
	wgsl: { moduleId: 'material.pbrLighting', entry: 'pbrLighting' },
	metadata: { keywords: ['Domain', 'Material', 'Effects'] }
};

registerPrimitive(pbrLighting);
