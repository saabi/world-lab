import type { PickingResult, RenderBackend, RenderFrame, RenderStats } from './RenderBackend.js';

/** Minimal WebGL orbit fallback (Wave 5) — renders clear color + banner state only. */
export class WebGLBackend implements RenderBackend {
	readonly kind = 'webgl' as const;
	private gl: WebGL2RenderingContext | null = null;

	async init(canvas: HTMLCanvasElement): Promise<void> {
		const gl = canvas.getContext('webgl2');
		if (!gl) throw new Error('WebGL2 not available');
		this.gl = gl;
	}

	resize(width: number, height: number): void {
		this.gl?.viewport(0, 0, width, height);
	}

	render(frame: RenderFrame): RenderStats {
		const gl = this.gl;
		if (!gl) return { frameMs: 0, patchCount: 0, vertexCount: 0, mode: frame.camera.mode };
		const t0 = performance.now();
		gl.clearColor(0.05, 0.08, 0.12, 1);
		gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
		return {
			frameMs: performance.now() - t0,
			patchCount: frame.orbitSchedule?.patchCount ?? 0,
			vertexCount: 0,
			mode: 'webgl-fallback'
		};
	}

	renderPickingPass(): PickingResult {
		return { hit: false };
	}

	renderHeightfieldPass(): void {}

	destroy(): void {
		this.gl = null;
	}
}
