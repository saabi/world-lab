/** WebGPU bind group layout indices and byte sizes — mirrors WGSL structs. */
export const BIND_GROUP = {
	frame: 0,
	planet: 1,
	scale: 2,
	patches: 3
} as const;

export const UNIFORM_ALIGN = 256;

// viewProj + view + cameraPos + debug + rotation + invViewProj + viewport = 256 B.
export const VIEW_UNIFORM_SIZE = 64 * 4;

export const MAX_GPU_LIGHTS = 4;

/** Mirrors `LightingUniforms` in lighting.wgsl (padded to 256 bytes). */
export const LIGHTING_UNIFORM_SIZE = 256;

/** Mirrors `AtmosphereParams` in atmosphereParams.wgsl (64 bytes). */
export const ATMOSPHERE_UNIFORM_SIZE = 64;

export interface GpuLightPacked {
	positionOrDir: [number, number, number, number];
	color: [number, number, number, number];
	params: [number, number, number, number];
}

export interface LightingUniforms {
	ambient: [number, number, number, number];
	lightCount: number;
	lights: GpuLightPacked[];
}

export interface ViewUniforms {
	viewProjection: Float32Array;
	view: Float32Array;
	cameraPos: [number, number, number, number];
	debug: [number, number, number, number]; // wireframe, faceColors, showPatches, time
	/** Planet rotation quaternion: [qx, qy, qz, qw]. */
	rotation: [number, number, number, number];
	/** inverse(viewProjection) — unprojects fragment NDC to a world ray (ideal-sphere
	 *  fragment sampling). */
	inverseViewProjection: Float32Array;
	/** Framebuffer size [widthPx, heightPx, _, _] for pixel → NDC in the fragment. */
	viewport: [number, number, number, number];
}

export function writeViewUniforms(buffer: ArrayBuffer, u: ViewUniforms): void {
	const view = new DataView(buffer);
	for (let i = 0; i < 16; i++) view.setFloat32(i * 4, u.viewProjection[i], true);
	for (let i = 0; i < 16; i++) view.setFloat32(64 + i * 4, u.view[i], true);
	view.setFloat32(128, u.cameraPos[0], true);
	view.setFloat32(132, u.cameraPos[1], true);
	view.setFloat32(136, u.cameraPos[2], true);
	view.setFloat32(140, u.cameraPos[3], true);
	view.setFloat32(144, u.debug[0], true);
	view.setFloat32(148, u.debug[1], true);
	view.setFloat32(152, u.debug[2], true);
	view.setFloat32(156, u.debug[3], true);
	view.setFloat32(160, u.rotation[0], true);
	view.setFloat32(164, u.rotation[1], true);
	view.setFloat32(168, u.rotation[2], true);
	view.setFloat32(172, u.rotation[3], true);
	for (let i = 0; i < 16; i++) view.setFloat32(176 + i * 4, u.inverseViewProjection[i], true);
	view.setFloat32(240, u.viewport[0], true);
	view.setFloat32(244, u.viewport[1], true);
	view.setFloat32(248, u.viewport[2], true);
	view.setFloat32(252, u.viewport[3], true);
}

export function writeLightingUniforms(buffer: ArrayBuffer, u: LightingUniforms): void {
	const view = new DataView(buffer);
	const amb = u.ambient;
	view.setFloat32(0, amb[0], true);
	view.setFloat32(4, amb[1], true);
	view.setFloat32(8, amb[2], true);
	view.setFloat32(12, amb[3] ?? 1, true);
	view.setUint32(16, Math.min(u.lightCount, MAX_GPU_LIGHTS), true);
	view.setUint32(20, 0, true);
	view.setUint32(24, 0, true);
	view.setUint32(28, 0, true);

	const base = 32;
	for (let i = 0; i < MAX_GPU_LIGHTS; i++) {
		const light = u.lights[i] ?? {
			positionOrDir: [0, 0, 1, 0],
			color: [0, 0, 0, 0],
			params: [0, 0, 0, 0]
		};
		const o = base + i * 48;
		for (let j = 0; j < 4; j++) view.setFloat32(o + j * 4, light.positionOrDir[j], true);
		for (let j = 0; j < 4; j++) view.setFloat32(o + 16 + j * 4, light.color[j], true);
		for (let j = 0; j < 4; j++) view.setFloat32(o + 32 + j * 4, light.params[j], true);
	}
}
