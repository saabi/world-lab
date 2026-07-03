import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import { planetRadiusParam, pureParam, ratioRParam } from './_params.js';
import { PLANET_SPACES } from './spaces.js';

export function evalHeightRemap(
	vor: [number, number, number],
	detail: number,
	params: {
		voronoi_amplitude: number;
		detail_amplitude: number;
		water_level: number;
		erosion: number;
		radius: number;
	}
): number {
	const v_amp = params.voronoi_amplitude * params.radius;
	const d_amp = params.detail_amplitude * params.radius;
	const total_amplitude = v_amp + d_amp;
	const wl = total_amplitude * (params.water_level - 0.5);
	let height = (vor[0] - 0.5) * v_amp + (detail - 0.5) * d_amp;
	let th = height - wl;
	const thf = th > 0 ? total_amplitude - wl : wl - params.radius;
	th = th / thf;
	th = Math.pow(th, params.erosion);
	th *= thf;
	height = wl + th;
	return params.radius + height;
}

const heightRemap: NodePrimitiveInput = {
	id: 'terrain.heightRemap',
	category: 'terrain',
	inputs: [
		{ name: 'vor', dataType: 'vec3f' },
		{ name: 'detail', dataType: 'f32' }
	],
	outputs: [
		{
			name: 'world_radius_meters',
			dataType: 'f32',
			space: PLANET_SPACES.WORLD_RADIUS_METERS
		}
	],
	params: Type.Object({
		voronoi_amplitude: ratioRParam(0.01),
		detail_amplitude: ratioRParam(0.01),
		water_level: pureParam(0.5),
		erosion: pureParam(1),
		radius: planetRadiusParam
	}),
	wgsl: { moduleId: 'terrain.heightRemap', entry: 'heightRemap' },
	metadata: {
		keywords: ['Domain', 'Terrain'],
		help: 'Combine Voronoi macro height and detail noise into world radius with water level and erosion.'
	},
	evalCPU(ctx) {
		const vor = ctx.inputs.vor as number[];
		const detail = ctx.inputs.detail as number;
		const world_radius_meters = evalHeightRemap(
			[vor[0], vor[1], vor[2]],
			detail,
			ctx.params as {
				voronoi_amplitude: number;
				detail_amplitude: number;
				water_level: number;
				erosion: number;
				radius: number;
			}
		);
		return { world_radius_meters };
	}
};

registerPrimitive(heightRemap);
