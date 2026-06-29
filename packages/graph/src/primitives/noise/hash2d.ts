/** Fi-hash helpers ported from noise-functions.glsl — f32 bitcast + u32 wrap via Math.imul. */

const U32_MAX = 0xffffffff;

const f32Buf = new ArrayBuffer(4);
const f32View = new DataView(f32Buf);
const u32View = new DataView(f32Buf);

function f32(n: number): number {
	return Math.fround(n);
}

function floatBitsToUint(v: number): number {
	f32View.setFloat32(0, f32(v), true);
	return u32View.getUint32(0, true);
}

function u32Xor(a: number, b: number): number {
	return (a ^ b) >>> 0;
}

function u32Mul(a: number, b: number): number {
	return Math.imul(a >>> 0, b >>> 0) >>> 0;
}

/** Mirror WGSL `f32(u32) / f32(0xffffffffu)`. */
function u32ToUnitFloat(n: number): number {
	return f32(f32(n >>> 0) / f32(U32_MAX));
}

export function hash12(p: readonly [number, number]): number {
	const sx = f32(p[0] * 141421356);
	const sy = f32(p[1] * 2718281828);
	const u0 = floatBitsToUint(sx);
	const u1 = floatBitsToUint(sy);
	return u32ToUnitFloat(u32Mul(u32Xor(u0, u1), 3141592653));
}

export function hash22(p: readonly [number, number]): [number, number] {
	const sx = f32(p[0] * 141421356);
	const sy = f32(p[1] * 2718281828);
	const u0 = floatBitsToUint(sx);
	const u1 = floatBitsToUint(sy);
	const xored = u32Xor(u0, u1);
	return [
		u32ToUnitFloat(u32Mul(xored, 3141592653)),
		u32ToUnitFloat(u32Mul(xored, 1618033988))
	];
}

export function hash32(p: readonly [number, number]): [number, number, number] {
	const sx = f32(p[0] * 141421356);
	const sy = f32(p[1] * 2718281828);
	const u0 = floatBitsToUint(sx);
	const u1 = floatBitsToUint(sy);
	const xored = u32Xor(u0, u1);
	return [
		u32ToUnitFloat(u32Mul(xored, 1732050807)),
		u32ToUnitFloat(u32Mul(xored, 2645751311)),
		u32ToUnitFloat(u32Mul(xored, 3316624790))
	];
}

export function lerp2(a: number, b: number, t: number): number {
	return a + t * (b - a);
}

export function normalize2(v: readonly [number, number]): [number, number] {
	const l = Math.hypot(v[0], v[1]);
	if (l < 1e-8) return [0, 0];
	return [v[0] / l, v[1] / l];
}
