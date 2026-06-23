import type { CameraState } from '../camera/cameraModes.js';
import { buildLocalFrame, type LocalFrame } from '../math/localFrame.js';
import { buildRenderFrame, type BuildRenderFrameInputs } from './buildRenderFrame.js';
import type { RenderBackend, RenderStats } from './RenderBackend.js';

// Headless host: owns a RenderBackend + the per-frame state (modeState, localFrame)
// and drives buildRenderFrame → backend.render. Any caller can render a planet from
// external params/camera/lighting — /planet's loop and the scene's focused-body view
// share it. See _docs/specs/scene-procedural-rendering.md.

/** Per-frame inputs, minus the host-owned per-frame state. */
export type PlanetRenderInputs = Omit<BuildRenderFrameInputs, 'modeState' | 'localFrame'>;

export class PlanetRenderer {
	private modeState: CameraState['mode'] = 'orbit';
	private localFrame: LocalFrame = buildLocalFrame([0, 0, 0], 1);

	constructor(private readonly backend: RenderBackend) {}

	async init(canvas: HTMLCanvasElement, sharedDevice?: GPUDevice): Promise<void> {
		await this.backend.init(canvas, sharedDevice);
	}

	resize(width: number, height: number): void {
		this.backend.resize(width, height);
	}

	render(input: PlanetRenderInputs): RenderStats {
		const r = buildRenderFrame({ ...input, modeState: this.modeState, localFrame: this.localFrame });
		this.modeState = r.modeState;
		this.localFrame = r.localFrame;
		return this.backend.render(r.frame);
	}

	destroy(): void {
		this.backend.destroy();
	}
}
