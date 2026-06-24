import orbitLineWgsl from '../gpu/wgsl/scene3d/orbitLine.wgsl';
import { sub3, type Vec3 } from '../math/vec.js';
import type { OrbitPath3D } from '../scene/orbitPaths.js';

const DEFAULT_COLOR: [number, number, number, number] = [0.45, 0.65, 0.95, 0.4];
// mat4(16) + color(4) + centerEye(4)
const UBUF_FLOATS = 24;

export class OrbitLinePass {
	private device: GPUDevice;
	private pipeline: GPURenderPipeline;
	private ubuf: GPUBuffer;
	private bindGroup: GPUBindGroup;
	private vbuf: GPUBuffer | null = null;
	private vcap = 0;

	constructor(device: GPUDevice, format: GPUTextureFormat) {
		this.device = device;
		const module = device.createShaderModule({ code: orbitLineWgsl });
		this.pipeline = device.createRenderPipeline({
			layout: 'auto',
			vertex: {
				module,
				entryPoint: 'vs',
				buffers: [
					{
						arrayStride: 12,
						attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
					}
				]
			},
			fragment: {
				module,
				entryPoint: 'fs',
				targets: [
					{
						format,
						blend: {
							color: {
								srcFactor: 'src-alpha',
								dstFactor: 'one-minus-src-alpha',
								operation: 'add'
							},
							alpha: {
								srcFactor: 'one',
								dstFactor: 'one-minus-src-alpha',
								operation: 'add'
							}
						}
					},
					{ format: 'r32float' }
				]
			},
			primitive: { topology: 'line-strip' },
			// Decorative overlay: skip depth test so nested coplanar rings (e.g. Glory I–III)
			// are not culled by far-pinned dot bodies or outer orbit fragments.
			depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'always' }
		});

		this.ubuf = device.createBuffer({
			size: UBUF_FLOATS * 4,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
		});
		this.bindGroup = device.createBindGroup({
			layout: this.pipeline.getBindGroupLayout(0),
			entries: [{ binding: 0, resource: { buffer: this.ubuf } }]
		});
	}

	private ensureVerts(count: number) {
		if (count <= this.vcap && this.vbuf) return;
		this.vbuf?.destroy();
		this.vcap = Math.max(count, 128);
		this.vbuf = this.device.createBuffer({
			size: this.vcap * 12,
			usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
		});
	}

	/** Record orbit polylines into the shared scene pass (orbit-local verts + centerEye). */
	record(
		pass: GPURenderPassEncoder,
		paths: OrbitPath3D[],
		viewProj: Float32Array,
		eye: Vec3,
		color: [number, number, number, number] = DEFAULT_COLOR
	) {
		if (paths.length === 0) return;

		pass.setPipeline(this.pipeline);
		pass.setBindGroup(0, this.bindGroup);

		for (const path of paths) {
			if (path.localPoints.length < 2) continue;
			// Closed line-strip: repeat the first point at the end.
			const verts = [...path.localPoints, path.localPoints[0]!];
			this.ensureVerts(verts.length);
			const data = new Float32Array(verts.length * 3);
			for (let i = 0; i < verts.length; i++) {
				data[i * 3] = verts[i]![0];
				data[i * 3 + 1] = verts[i]![1];
				data[i * 3 + 2] = verts[i]![2];
			}
			this.device.queue.writeBuffer(this.vbuf!, 0, data);

			const centerEye = sub3(path.center, eye);
			const u = new Float32Array(UBUF_FLOATS);
			u.set(viewProj, 0);
			u.set(color, 16);
			u[20] = centerEye[0];
			u[21] = centerEye[1];
			u[22] = centerEye[2];
			this.device.queue.writeBuffer(this.ubuf, 0, u);

			pass.setVertexBuffer(0, this.vbuf!);
			pass.draw(verts.length);
		}
	}

	destroy() {
		this.ubuf.destroy();
		this.vbuf?.destroy();
	}
}
