import { alignTo, rgba8BufferByteLength } from '../buffers.js';
import { ResourceRealizer } from '../frameGraph/realize.js';
import type { PassGraph } from '../frameGraph/types.js';

export const BUFFER_FEEDBACK_RESOURCE_ID = 'buffer-feedback-state';

export function buildBufferFeedbackPassGraph(elementCount: number): PassGraph {
	if (!Number.isInteger(elementCount) || elementCount <= 0) {
		throw new Error('Buffer feedback element count must be a positive integer');
	}
	return {
		targets: [
			{
				id: BUFFER_FEEDBACK_RESOURCE_ID,
				shape: {
					kind: 'buffer',
					element: { kind: 'scalar', scalar: 'f32' },
					access: 'read-write',
					usages: ['storage', 'copy-dst']
				},
				lifetime: { kind: 'history', slots: 2 },
				size: { kind: 'element-count', count: elementCount }
			}
		],
		passes: [
			{
				consumerId: 'buffer-feedback-step',
				writeTarget: BUFFER_FEEDBACK_RESOURCE_ID,
				reads: [
					{
						channel: 0,
						target: BUFFER_FEEDBACK_RESOURCE_ID,
						version: 'previous'
					}
				],
				bindings: [
					{ resourceId: BUFFER_FEEDBACK_RESOURCE_ID, access: 'read-write' }
				]
			}
		],
		display: BUFFER_FEEDBACK_RESOURCE_ID
	};
}

function feedbackShader(gridWidth: number): string {
	return `
struct VSOut {
	@builtin(position) position: vec4f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
	let x = f32((vertexIndex << 1u) & 2u);
	let y = f32(vertexIndex & 2u);
	var out: VSOut;
	out.position = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
	return out;
}

@group(0) @binding(0) var<storage, read> previous: array<f32>;
@group(0) @binding(1) var<storage, read_write> next: array<f32>;

@fragment
fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
	let index = u32(position.x) + u32(position.y) * ${gridWidth}u;
	let nextState = 1.0 - previous[index];
	next[index] = nextState;
	return vec4f(nextState, nextState, nextState, 1.0);
}`;
}

async function readTexture(
	device: GPUDevice,
	texture: GPUTexture,
	width: number,
	height: number
): Promise<Uint8Array> {
	const bytesPerRow = alignTo(width * 4, 256);
	const readback = device.createBuffer({
		label: 'buffer-feedback-readback',
		size: bytesPerRow * height,
		usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ
	});
	const encoder = device.createCommandEncoder({ label: 'buffer-feedback-readback' });
	encoder.copyTextureToBuffer(
		{ texture },
		{ buffer: readback, bytesPerRow, rowsPerImage: height },
		{ width, height }
	);
	device.queue.submit([encoder.finish()]);
	await readback.mapAsync(GPUMapMode.READ);
	const mapped = new Uint8Array(readback.getMappedRange());
	const pixels = new Uint8Array(rgba8BufferByteLength(width, height));
	const rowBytes = width * 4;
	for (let y = 0; y < height; y += 1) {
		pixels.set(mapped.subarray(y * bytesPerRow, y * bytesPerRow + rowBytes), y * rowBytes);
	}
	readback.unmap();
	readback.destroy();
	return pixels;
}

export class BufferFeedbackExecutor {
	private realizer: ResourceRealizer | undefined;
	private presentationTexture: GPUTexture | undefined;
	private device: GPUDevice | undefined;
	private gridWidth: number | undefined;
	private gridHeight: number | undefined;
	private seeded = false;

	private ensureAllocated(device: GPUDevice, gridWidth: number, gridHeight: number): void {
		const unchanged =
			this.device === device &&
			this.gridWidth === gridWidth &&
			this.gridHeight === gridHeight;
		if (unchanged && this.realizer && this.presentationTexture) return;

		this.dispose();
		const realizer = new ResourceRealizer(device);
		let presentationTexture: GPUTexture;
		try {
			presentationTexture = device.createTexture({
				label: 'buffer-feedback-presentation',
				size: [gridWidth, gridHeight],
				format: 'rgba8unorm',
				usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC
			});
		} catch (error) {
			realizer.dispose();
			throw error;
		}
		this.realizer = realizer;
		this.presentationTexture = presentationTexture;
		this.device = device;
		this.gridWidth = gridWidth;
		this.gridHeight = gridHeight;
		this.seeded = false;
	}

	async execute(
		device: GPUDevice,
		gridWidth: number,
		gridHeight: number
	): Promise<{ pixels: Uint8Array }> {
		if (
			!Number.isInteger(gridWidth) ||
			!Number.isInteger(gridHeight) ||
			gridWidth <= 0 ||
			gridHeight <= 0
		) {
			throw new Error('Buffer feedback grid dimensions must be positive integers');
		}
		this.ensureAllocated(device, gridWidth, gridHeight);
		const graph = buildBufferFeedbackPassGraph(gridWidth * gridHeight);
		const realizer = this.realizer!;
		const presentationTexture = this.presentationTexture!;
		realizer.realizeAll(graph, { width: gridWidth, height: gridHeight });
		const realized = realizer.resolve(BUFFER_FEEDBACK_RESOURCE_ID);
		const previous = realized.readPrevious as GPUBuffer | undefined;
		if (!previous) throw new Error('Buffer feedback history resource has no previous-frame slot');

		if (!this.seeded) {
			device.queue.writeBuffer(previous, 0, new Float32Array(gridWidth * gridHeight));
			this.seeded = true;
		}

		const module = device.createShaderModule({
			label: 'buffer-feedback',
			code: feedbackShader(gridWidth)
		});
		const pipeline = device.createRenderPipeline({
			label: 'buffer-feedback',
			layout: 'auto',
			vertex: { module, entryPoint: 'vs_main' },
			fragment: {
				module,
				entryPoint: 'fs_main',
				targets: [{ format: 'rgba8unorm' }]
			},
			primitive: { topology: 'triangle-list' }
		});
		const bindGroup = device.createBindGroup({
			layout: pipeline.getBindGroupLayout(0),
			entries: [
				{ binding: 0, resource: { buffer: previous } },
				{ binding: 1, resource: { buffer: realized.write as GPUBuffer } }
			]
		});
		const encoder = device.createCommandEncoder({ label: 'buffer-feedback-step' });
		const pass = encoder.beginRenderPass({
			label: 'buffer-feedback-step',
			colorAttachments: [
				{
					view: presentationTexture.createView(),
					loadOp: 'clear',
					storeOp: 'store',
					clearValue: { r: 0, g: 0, b: 0, a: 1 }
				}
			]
		});
		pass.setPipeline(pipeline);
		pass.setBindGroup(0, bindGroup);
		pass.draw(3);
		pass.end();
		device.queue.submit([encoder.finish()]);
		realizer.advanceFrame();

		return {
			pixels: await readTexture(device, presentationTexture, gridWidth, gridHeight)
		};
	}

	dispose(): void {
		this.realizer?.dispose();
		this.presentationTexture?.destroy();
		this.realizer = undefined;
		this.presentationTexture = undefined;
		this.device = undefined;
		this.gridWidth = undefined;
		this.gridHeight = undefined;
		this.seeded = false;
	}
}
