/** Cube face 0 = +X … 5 = -Z; uv maps to s,t in [-1,1] per M11.1 / planet patches convention. */
export function cubeFaceUvToPosition(face: number, u: number, v: number): [number, number, number] {
	const s = u * 2 - 1;
	const t = v * 2 - 1;
	switch (face) {
		case 0:
			return [1, t, -s];
		case 1:
			return [-1, t, s];
		case 2:
			return [s, 1, -t];
		case 3:
			return [s, -1, t];
		case 4:
			return [s, t, 1];
		case 5:
			return [-s, t, -1];
		default:
			return [0, 0, 1];
	}
}
