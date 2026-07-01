import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

function hash3(ix: number, iy: number, iz: number): number {
	let n = (ix * 374761393 + iy * 668265263 + iz * 1274126177) >>> 0;
	n = (n ^ (n >>> 13)) * 1274126177;
	n = n ^ (n >>> 16);
	return (n & 0xffff) / 65535;
}

function featurePoint(ix: number, iy: number, iz: number): [number, number, number] {
	return [hash3(ix, iy, iz), hash3(iy, iz, ix), hash3(iz, ix, iy)];
}

export function evalWorley3d(x: number, y: number, z: number): number {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const zi = Math.floor(z);
	const xf = x - xi;
	const yf = y - yi;
	const zf = z - zi;

	let minDist = 1.0;
	for (let k = -1; k <= 1; k++) {
		for (let j = -1; j <= 1; j++) {
			for (let i = -1; i <= 1; i++) {
				const fp = featurePoint(xi + i, yi + j, zi + k);
				const dx = i + fp[0] - xf;
				const dy = j + fp[1] - yf;
				const dz = k + fp[2] - zf;
				const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
				minDist = Math.min(minDist, dist);
			}
		}
	}
	return minDist;
}

const worley: NodePrimitive = {
	id: 'noise.worley',
	category: 'noise',
	inputs: [{ name: 'position', dataType: 'vec3f' }],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'noise.worley', entry: 'worley' },
	metadata: {
		help: '3D Worley/cellular distance noise.',
		pure: true,
		deterministic: true
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position as number[];
		const value = evalWorley3d(position[0], position[1], position[2]);
		return { value };
	}
};

registerPrimitive(worley);
