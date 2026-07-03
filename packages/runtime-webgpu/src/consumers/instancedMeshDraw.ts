export interface InstancedMeshTemplate {
	positions: Float32Array;
	normals: Float32Array;
	indices: Uint16Array | Uint32Array;
}

export interface InstanceVertexLayout {
	arrayStride: number;
	attributes: GPUVertexAttribute[];
}

export interface RenderInstancedMeshInput {
	device: GPUDevice;
	pass: GPURenderPassEncoder;
	format: GPUTextureFormat;
	label: string;
	shaderCode: string;
	uniformBuffer: GPUBuffer;
	template: InstancedMeshTemplate;
	instanceBuffer: GPUBuffer;
	instanceLayout: InstanceVertexLayout;
	instanceCount: number;
}

export function indexFormatForTemplate(
	indices: Uint16Array | Uint32Array
): GPUIndexFormat {
	return indices instanceof Uint16Array ? 'uint16' : 'uint32';
}

export function validateInstancedMeshDrawInput(input: RenderInstancedMeshInput): void {
	const { template, instanceLayout, instanceCount } = input;

	if (instanceCount < 0) {
		throw new RangeError('instanceCount must be non-negative');
	}
	if (instanceCount === 0) {
		return;
	}

	if (template.positions.length % 3 !== 0 || template.positions.length === 0) {
		throw new RangeError('template positions must contain at least one vec3 vertex');
	}
	if (template.normals.length !== template.positions.length) {
		throw new RangeError('template normals must match positions length');
	}
	if (template.indices.length % 3 !== 0 || template.indices.length === 0) {
		throw new RangeError('template indices must contain at least one triangle');
	}

	if (instanceLayout.arrayStride <= 0) {
		throw new RangeError('instance vertex layout stride must be positive');
	}
	for (const attribute of instanceLayout.attributes) {
		if (attribute.offset < 0 || attribute.offset >= instanceLayout.arrayStride) {
			throw new RangeError('instance vertex attribute offset must fall within stride');
		}
	}
}

/** Draw N copies of a template mesh with per-instance vertex data on an open render pass. */
export function renderInstancedMesh(input: RenderInstancedMeshInput): void {
	validateInstancedMeshDrawInput(input);

	const {
		device,
		pass,
		format,
		label,
		shaderCode,
		uniformBuffer,
		template,
		instanceBuffer,
		instanceLayout,
		instanceCount
	} = input;

	if (instanceCount === 0) {
		return;
	}

	const { positions, normals, indices } = template;
	const indexFormat = indexFormatForTemplate(indices);

	const templateVertexBuffer = device.createBuffer({
		label: `${label}-template-vertices`,
		size: positions.byteLength + normals.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(templateVertexBuffer, 0, positions.buffer, positions.byteOffset, positions.byteLength);
	device.queue.writeBuffer(
		templateVertexBuffer,
		positions.byteLength,
		normals.buffer,
		normals.byteOffset,
		normals.byteLength
	);

	const templateIndexBuffer = device.createBuffer({
		label: `${label}-template-indices`,
		size: indices.byteLength,
		usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST
	});
	device.queue.writeBuffer(
		templateIndexBuffer,
		0,
		indices.buffer,
		indices.byteOffset,
		indices.byteLength
	);

	const shaderModule = device.createShaderModule({
		label: `${label}-shader`,
		code: shaderCode
	});

	const pipeline = device.createRenderPipeline({
		label: `${label}-pipeline`,
		layout: 'auto',
		vertex: {
			module: shaderModule,
			entryPoint: 'vs',
			buffers: [
				{
					arrayStride: 12,
					attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }]
				},
				{
					arrayStride: 12,
					attributes: [{ shaderLocation: 1, offset: 0, format: 'float32x3' }]
				},
				{
					arrayStride: instanceLayout.arrayStride,
					stepMode: 'instance',
					attributes: instanceLayout.attributes
				}
			]
		},
		fragment: {
			module: shaderModule,
			entryPoint: 'fs',
			targets: [{ format }]
		},
		primitive: { topology: 'triangle-list', cullMode: 'none' },
		depthStencil: { depthWriteEnabled: true, depthCompare: 'less', format: 'depth24plus' }
	});

	const bindGroup = device.createBindGroup({
		layout: pipeline.getBindGroupLayout(0),
		entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
	});

	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.setVertexBuffer(0, templateVertexBuffer, 0, positions.byteLength);
	pass.setVertexBuffer(1, templateVertexBuffer, positions.byteLength, normals.byteLength);
	pass.setVertexBuffer(2, instanceBuffer);
	pass.setIndexBuffer(templateIndexBuffer, indexFormat);
	pass.drawIndexed(indices.length, instanceCount);
}
