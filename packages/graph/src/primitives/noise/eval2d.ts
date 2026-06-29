import { hash12, hash22, hash32, lerp2, normalize2 } from './hash2d.js';

export function evalValue2d(x: number, y: number): number {
	const px = Math.fround(x);
	const py = Math.fround(y);
	const i0 = Math.floor(px);
	const i1 = Math.floor(py);
	let fx = px - i0;
	let fy = py - i1;
	fx = fx * fx * (3 - 2 * fx);
	fy = fy * fy * (3 - 2 * fy);
	return lerp2(
		lerp2(hash12([i0, i1]), hash12([i0 + 1, i1]), fx),
		lerp2(hash12([i0, i1 + 1]), hash12([i0 + 1, i1 + 1]), fx),
		fy
	);
}

export function evalPerlin2d(x: number, y: number): number {
	const px = Math.fround(x);
	const py = Math.fround(y);
	const i0 = Math.floor(px);
	const i1 = Math.floor(py);
	const fx = px - i0;
	const fy = py - i1;
	const ux = fx * fx * fx * (10 + fx * (6 * fx - 15));
	const uy = fy * fy * fy * (10 + fy * (6 * fy - 15));
	const grad = (ox: number, oy: number, dx: number, dy: number) => {
		const h = hash22([i0 + ox, i1 + oy]);
		const g = normalize2([h[0] - 0.5, h[1] - 0.5]);
		return g[0] * dx + g[1] * dy;
	};
	const a = grad(0, 0, fx, fy);
	const b = grad(1, 0, fx - 1, fy);
	const c = grad(0, 1, fx, fy - 1);
	const d = grad(1, 1, fx - 1, fy - 1);
	return lerp2(lerp2(a, b, ux), lerp2(c, d, ux), uy) * 0.7 + 0.5;
}

export function evalPerlin2dDeriv(x: number, y: number): [number, number, number] {
	const px = Math.fround(x);
	const py = Math.fround(y);
	const i0 = Math.floor(px);
	const i1 = Math.floor(py);
	const fx = px - i0;
	const fy = py - i1;
	const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
	const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
	const dux = 30 * fx * fx * (fx * (fx - 2) + 1);
	const duy = 30 * fy * fy * (fy * (fy - 2) + 1);

	const corner = (ox: number, oy: number) => {
		const h = hash22([i0 + ox, i1 + oy]);
		return [h[0] * 2 - 1, h[1] * 2 - 1] as const;
	};
	const ga = corner(0, 0);
	const gb = corner(1, 0);
	const gc = corner(0, 1);
	const gd = corner(1, 1);

	const va = ga[0] * fx + ga[1] * fy;
	const vb = gb[0] * (fx - 1) + gb[1] * fy;
	const vc = gc[0] * fx + gc[1] * (fy - 1);
	const vd = gd[0] * (fx - 1) + gd[1] * (fy - 1);

	const value =
		va + ux * (vb - va) + uy * (vc - va) + ux * uy * (va - vb - vc + vd);
	const s = va - vb - vc + vd;
	const innerX = uy * s + vb - va;
	const innerY = ux * s + vc - va;
	const dx =
		ga[0] +
		ux * (gb[0] - ga[0]) +
		uy * (gc[0] - ga[0]) +
		ux * uy * (ga[0] - gb[0] - gc[0] + gd[0]) +
		dux * innerX;
	const dy =
		ga[1] +
		ux * (gb[1] - ga[1]) +
		uy * (gc[1] - ga[1]) +
		ux * uy * (ga[1] - gb[1] - gc[1] + gd[1]) +
		duy * innerY;

	return [value, dx, dy];
}

export function evalWorley2d(x: number, y: number): number {
	const px = Math.fround(x);
	const py = Math.fround(y);
	const i0 = Math.floor(px);
	const i1 = Math.floor(py);
	let lx = px - i0;
	let ly = py - i1;
	let w = 1e9;
	for (let ox = -1; ox <= 1; ox++) {
		for (let oy = -1; oy <= 1; oy++) {
			const h = hash12([i0 + ox, i1 + oy]);
			const cx = lx - ox - h;
			const cy = ly - oy - h;
			w = Math.min(w, cx * cx + cy * cy);
		}
	}
	return 1 - Math.sqrt(w);
}

export function evalVoronoi2d(x: number, y: number, smoothness: number): number {
	const px = Math.fround(x);
	const py = Math.fround(y);
	const s = 1 / smoothness;
	const p0 = Math.floor(px);
	const p1 = Math.floor(py);
	const fx = px - p0;
	const fy = py - p1;
	let va = 0;
	let wt = 0;
	for (let ox = -1; ox <= 1; ox++) {
		for (let oy = -1; oy <= 1; oy++) {
			const o = hash32([p0 + ox, p1 + oy]);
			const dx = ox - fx + o[0];
			const dy = oy - fy + o[1];
			const d = Math.hypot(dx, dy);
			const edge = 1.414;
			const t = Math.max(0, Math.min(1, (edge - d) / edge));
			const ww = t * t * (3 - 2 * t);
			const weight = ww ** s;
			va += o[2] * weight;
			wt += weight;
		}
	}
	return va / wt;
}

export function evalBlue2d(x: number, y: number): number {
	const px = Math.fround(x);
	const py = Math.fround(y);
	let v = 0;
	for (let k = 0; k < 9; k++) {
		const ox = (k % 3) - 1;
		const oy = Math.floor(k / 3) - 1;
		v += hash12([px + ox, py + oy]);
	}
	return 0.9 * (1.125 * hash12([px, py]) - v / 8) + 0.5;
}
