import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { planetRadiusParam, pureParam, ratioRParam, scaleMppInput } from './_params.js';

const biomeMaterial: NodePrimitive = {
	id: 'terrain.biomeMaterial',
	category: 'material',
	inputs: [
		{ name: 'sample_unit_dir', dataType: 'vec3f', space: 'body_dir' },
		{ name: 'sample_world_pos', dataType: 'vec3f', space: 'world_pos' },
		{ name: 'sample_height_meters', dataType: 'f32', space: 'height_meters' },
		{ name: 'sample_distortion', dataType: 'f32' },
		{ name: 'sample_vor', dataType: 'vec3f' },
		{ name: 'sample_detail', dataType: 'f32' },
		scaleMppInput
	],
	outputs: [
		{ name: 'albedo', dataType: 'vec3f' },
		{ name: 'roughness', dataType: 'f32' }
	],
	params: Type.Object({
		voronoi_albedo: pureParam(1),
		voronoi_albedo_y: pureParam(1),
		voronoi_albedo_z: pureParam(1),
		voronoi_distortion_albedo: pureParam(1),
		detail_albedo: pureParam(1),
		voronoi_amplitude: ratioRParam(0.01),
		detail_amplitude: ratioRParam(0.01),
		water_level: pureParam(0.5),
		vegetation_level: pureParam(0),
		sand_cutoff: pureParam(0),
		snow_cover: pureParam(1),
		texture_noise_scale: pureParam(1),
		texture_noise_amplitude: ratioRParam(0),
		polar_scale: pureParam(0),
		polar_amplitude: ratioRParam(0),
		radius: planetRadiusParam
	}),
	wgsl: { moduleId: 'terrain.biomeMaterial', entry: 'biomeMaterial' },
	metadata: {
		keywords: ['Domain', 'Material'],
		help: 'Biome-driven albedo and roughness from height, slope, and noise samples.'
	}
};

registerPrimitive(biomeMaterial);
