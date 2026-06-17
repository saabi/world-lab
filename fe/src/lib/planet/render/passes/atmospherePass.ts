import atmosphereFullscreenShader from '../../gpu/wgsl/atmosphere/atmosphereFullscreen.wgsl';
import type { TerrainPass } from './terrainPass.js';
import type { RenderFrame } from '../RenderBackend.js';
import {
	ATMOSPHERE_UNIFORM_SIZE,
	LIGHTING_UNIFORM_SIZE,
	writeLightingUniforms
} from '../uniformLayouts.js';
import { invert4 } from '../../math/mat4.js';
import { MATERIAL_OVERRIDES_UNIFORM_SIZE, writeMaterialOverrides } from '../materialOverrides.js';
import {
	toGpuAtmosphereParams,
	writeAtmosphereParamsToBuffer
} from '../../params/atmosphereParams.js';

const ATMOSPHERE_FRAME_SIZE = 256;

/** Atmosphere fog — fullscreen composite pass after terrain. */
export const ATMOSPHERE_PASS_ENABLED = true;

export class AtmospherePass {
	readonly pipeline: GPURenderPipeline;
	readonly frameBuffer: GPUBuffer;
	readonly atmosphereBuffer: GPUBuffer;
	readonly sampler: GPUSampler;

	constructor(
		private readonly device: GPUDevice,
		readonly format: GPUTextureFormat
	) {
		this.frameBuffer = device.createBuffer({
			size: ATMOSPHERE_FRAME_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.atmosphereBuffer = device.createBuffer({
			size: ATMOSPHERE_UNIFORM_SIZE,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

		const module = device.createShaderModule({ code: atmosphereFullscreenShader });
		const layout = device.createPipelineLayout({
			bindGroupLayouts: [this.frameBgl(), this.sceneBgl()]
		});
		this.pipeline = device.createRenderPipeline({
			layout,
			vertex: { module, entryPoint: 'vs_main' },
			fragment: {
				module,
				entryPoint: 'fs_main',
				targets: [{ format: this.format }]
			},
			primitive: { topology: 'triangle-list' }
		});
	}

	private frameBgl(): GPUBindGroupLayout {
		return this.device.createBindGroupLayout({
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
					buffer: { type: 'uniform' }
				},
				{ binding: 1, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
				{ binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
				{ binding: 3, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }
			]
		});
	}

	private sceneBgl(): GPUBindGroupLayout {
		return this.device.createBindGroupLayout({
			entries: [
				{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
				{ binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
				{ binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
			]
		});
	}

	uploadUniforms(frame: RenderFrame): void {
		const invVp = invert4(frame.camera.viewProjectionMatrix);
		const staging = new ArrayBuffer(ATMOSPHERE_FRAME_SIZE);
		const view = new DataView(staging);
		for (let i = 0; i < 16; i++) view.setFloat32(i * 4, invVp[i], true);
		view.setFloat32(64, frame.camera.position[0], true);
		view.setFloat32(68, frame.camera.position[1], true);
		view.setFloat32(72, frame.camera.position[2], true);
		view.setFloat32(76, 1, true);
		view.setFloat32(80, frame.viewportWidthPx, true);
		view.setFloat32(84, frame.viewportHeightPx, true);
		this.device.queue.writeBuffer(this.frameBuffer, 0, staging);

		const atmoGpu = toGpuAtmosphereParams(frame.atmosphere, frame.params.radius, [0, 0, 0]);
		const atmoStaging = new ArrayBuffer(ATMOSPHERE_UNIFORM_SIZE);
		writeAtmosphereParamsToBuffer(atmoStaging, 0, atmoGpu);
		this.device.queue.writeBuffer(this.atmosphereBuffer, 0, atmoStaging);
	}

	render(
		encoder: GPUCommandEncoder,
		outputView: GPUTextureView,
		terrain: TerrainPass,
		frame: RenderFrame,
		_width: number,
		_height: number
	): void {
		if (!ATMOSPHERE_PASS_ENABLED) return;

		const colorView = terrain.getColorView();
		const depthView = terrain.getDepthView();
		if (!colorView || !depthView) return;

		this.uploadUniforms(frame);

		const lightingStaging = new ArrayBuffer(LIGHTING_UNIFORM_SIZE);
		writeLightingUniforms(lightingStaging, frame.lighting);
		this.device.queue.writeBuffer(terrain.lightingBuffer, 0, lightingStaging);

		const overridesStaging = new ArrayBuffer(MATERIAL_OVERRIDES_UNIFORM_SIZE);
		writeMaterialOverrides(overridesStaging, frame.materialOverrides);
		this.device.queue.writeBuffer(terrain.materialOverridesBuffer, 0, overridesStaging);

		const frameBg = this.device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: this.frameBuffer } },
				{ binding: 1, resource: { buffer: terrain.lightingBuffer } },
				{ binding: 2, resource: { buffer: terrain.materialOverridesBuffer } },
				{ binding: 3, resource: { buffer: this.atmosphereBuffer } }
			]
		});
		const sceneBg = this.device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(1),
			entries: [
				{ binding: 0, resource: colorView },
				{ binding: 1, resource: depthView },
				{ binding: 2, resource: this.sampler }
			]
		});

		const pass = encoder.beginRenderPass({
			colorAttachments: [
				{
					view: outputView,
					loadOp: 'clear',
					clearValue: { r: 0.02, g: 0.03, b: 0.08, a: 1 },
					storeOp: 'store'
				}
			]
		});
		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, frameBg);
		pass.setBindGroup(1, sceneBg);
		pass.draw(3);
		pass.end();
	}

	destroy(): void {
		this.frameBuffer.destroy();
		this.atmosphereBuffer.destroy();
	}
}
