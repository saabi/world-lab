import sphereWgsl from '../gpu/wgsl/scene3d/sphere.wgsl';
import { makeUVSphere } from './sphereMesh.js';
import type { Vec3 } from '../math/vec.js';

// Lightweight 3D renderer for the scene viewport: one instanced sphere per body.
// Shares only the GPU device with the planet backend. See scene-3d-viewport.md.

export interface BodyInstance {
	position: Vec3; // world metres
	radius: number; // metres
	color: Vec3; // rgb 0..1
	emissive: boolean; // stars render full-bright
}

export interface SceneLighting {
	lightPos: Vec3; // world position of the sun (point light)
	lightColor: Vec3;
	lightIntensity: number;
	ambient: Vec3;
}

const INSTANCE_FLOATS = 20; // mat4(16) + color(4)
const INSTANCE_BYTES = INSTANCE_FLOATS * 4;
const CLEAR = { r: 0.02, g: 0.03, b: 0.06, a: 1 };

export class SceneRenderer {
	private device: GPUDevice;
	private pipeline: GPURenderPipeline;
	private vbuf: GPUBuffer;
	private ibuf: GPUBuffer;
	private indexCount: number;
	private ubuf: GPUBuffer;
	private bindGroup: GPUBindGroup;
	private instanceBuf: GPUBuffer | null = null;
	private instanceCap = 0;
	private depth: GPUTexture | null = null;
	private depthW = 0;
	private depthH = 0;

	constructor(device: GPUDevice, format: GPUTextureFormat) {
		this.device = device;
		const module = device.createShaderModule({ code: sphereWgsl });
		this.pipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex: {
				module,
				entryPoint: 'vs',
				buffers: [
					{
						arrayStride: 24,
						attributes: [
							{ shaderLocation: 0, offset: 0, format: 'float32x3' },
							{ shaderLocation: 1, offset: 12, format: 'float32x3' }
						]
					},
					{
						arrayStride: INSTANCE_BYTES,
						stepMode: 'instance',
						attributes: [
							{ shaderLocation: 2, offset: 0, format: 'float32x4' },
							{ shaderLocation: 3, offset: 16, format: 'float32x4' },
							{ shaderLocation: 4, offset: 32, format: 'float32x4' },
							{ shaderLocation: 5, offset: 48, format: 'float32x4' },
							{ shaderLocation: 6, offset: 64, format: 'float32x4' }
						]
					}
				]
			},
			fragment: { module, entryPoint: 'fs', targets: [{ format }] },
			primitive: { topology: 'triangle-list', cullMode: 'none' },
			depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less' }
		});

		const mesh = makeUVSphere();
		this.indexCount = mesh.indexCount;
		this.vbuf = device.createBuffer({
			size: mesh.vertices.byteLength,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(this.vbuf, 0, mesh.vertices);
		const idxSize = (mesh.indices.byteLength + 3) & ~3; // round up to 4
		this.ibuf = device.createBuffer({
			size: idxSize,
			usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
		});
		device.queue.writeBuffer(this.ibuf, 0, mesh.indices);

		this.ubuf = device.createBuffer({
			size: 112, // viewProj(64) + lightDir(16) + lightColor(16) + ambient(16)
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.bindGroup = device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(0),
			entries: [{ binding: 0, resource: { buffer: this.ubuf } }]
		});
	}

	private ensureDepth(w: number, h: number) {
		if (this.depth && this.depthW === w && this.depthH === h) return;
		this.depth?.destroy();
		this.depth = this.device.createTexture({
			size: { width: w, height: h },
			format: 'depth24plus',
			usage: GPUTextureUsage.RENDER_ATTACHMENT
		});
		this.depthW = w;
		this.depthH = h;
	}

	private ensureInstances(count: number) {
		if (count <= this.instanceCap && this.instanceBuf) return;
		this.instanceBuf?.destroy();
		this.instanceCap = Math.max(count, 8);
		this.instanceBuf = this.device.createBuffer({
			size: this.instanceCap * INSTANCE_BYTES,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
		});
	}

	render(
		view: GPUTextureView,
		width: number,
		height: number,
		instances: BodyInstance[],
		viewProj: Float32Array,
		light: SceneLighting
	) {
		this.ensureDepth(width, height);

		if (instances.length > 0) {
			this.ensureInstances(instances.length);
			const data = new Float32Array(instances.length * INSTANCE_FLOATS);
			for (let i = 0; i < instances.length; i++) {
				const b = i * INSTANCE_FLOATS;
				const r = instances[i].radius;
				const p = instances[i].position;
				// Column-major model = translate(p) · scale(r).
				data[b + 0] = r;
				data[b + 5] = r;
				data[b + 10] = r;
				data[b + 12] = p[0];
				data[b + 13] = p[1];
				data[b + 14] = p[2];
				data[b + 15] = 1;
				const c = instances[i].color;
				data[b + 16] = c[0];
				data[b + 17] = c[1];
				data[b + 18] = c[2];
				data[b + 19] = instances[i].emissive ? 1 : 0;
			}
			this.device.queue.writeBuffer(this.instanceBuf!, 0, data);
		}

		const u = new Float32Array(28);
		u.set(viewProj, 0);
		u.set([light.lightPos[0], light.lightPos[1], light.lightPos[2], 0], 16);
		u.set([light.lightColor[0], light.lightColor[1], light.lightColor[2], light.lightIntensity], 20);
		u.set([light.ambient[0], light.ambient[1], light.ambient[2], 0], 24);
		this.device.queue.writeBuffer(this.ubuf, 0, u);

		const encoder = this.device.createCommandEncoder();
		const pass = encoder.beginRenderPass({
			colorAttachments: [{ view, clearValue: CLEAR, loadOp: 'clear', storeOp: 'store' }],
			depthStencilAttachment: {
				view: this.depth!.createView(),
				depthClearValue: 1,
				depthLoadOp: 'clear',
				depthStoreOp: 'store'
			}
		});
		if (instances.length > 0) {
			pass.setPipeline(this.pipeline);
			pass.setBindGroup(0, this.bindGroup);
			pass.setVertexBuffer(0, this.vbuf);
			pass.setVertexBuffer(1, this.instanceBuf!);
			pass.setIndexBuffer(this.ibuf, 'uint16');
			pass.drawIndexed(this.indexCount, instances.length);
		}
		pass.end();
		this.device.queue.submit([encoder.finish()]);
	}

	destroy() {
		this.vbuf.destroy();
		this.ibuf.destroy();
		this.ubuf.destroy();
		this.instanceBuf?.destroy();
		this.depth?.destroy();
	}
}
