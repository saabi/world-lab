import { describe, expect, it } from 'vitest';
import { getPrimitive } from '../registry.js';
import './surfaces/index.js';

const ev = (id: string, inputs: Record<string, unknown>, params: Record<string, unknown> = {}) =>
	getPrimitive(id)!.evalCPU!({ inputs: inputs as never, params: params as never });
const len = (v: number[]) => Math.hypot(...v);

describe('surface mapping primitives', () => {
	it('plane maps uv to the z=0 plane with +z normal', () => {
		const o = ev('surface.plane', { uv: [0.5, 0.5] });
		expect(o.position).toEqual([0, 0, 0]);
		expect(o.normal).toEqual([0, 0, 1]);
	});

	it('cubeSphere face 0 centre is the unit +x direction', () => {
		const o = ev('surface.cubeSphere', { uv: [0.5, 0.5] }, { face: 0 });
		const p = o.position as number[];
		expect(Math.abs(len(p) - 1)).toBeLessThan(1e-6);
		expect(p[0]).toBeGreaterThan(0.999);
		expect(o.normal).toEqual(o.position); // unit sphere
	});

	it('cubeSphere outputs declare body spaces', () => {
		const cs = getPrimitive('surface.cubeSphere')!;
		expect(cs.outputs.find((o) => o.name === 'position')!.space).toBe('body_pos');
		expect(cs.outputs.find((o) => o.name === 'normal')!.space).toBe('body_dir');
	});
});
