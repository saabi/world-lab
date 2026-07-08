import {
	assembleStageEntry,
	bindingDeclKindForTemplate,
	type BindingDecl,
	type ConsumerShader
} from '@world-lab/compiler';
import {
	resolveKernelBindings,
	type KernelBindingTemplate,
	type ResolvedKernelBinding
} from '@world-lab/graph';

export type ComputeKernelResource =
	| { kind: 'buffer'; buffer: GPUBuffer }
	| { kind: 'texture'; texture: GPUTexture }
	| { kind: 'sampler'; sampler: GPUSampler };

export type DispatchDomain =
	| readonly [number, number, number]
	| { kind: 'buffer'; elementCount: number }
	| { kind: 'texture'; width: number; height: number };

export interface ComputeKernelInput {
	/** A compiled compute-stage function library, same as assembleStageEntry consumes elsewhere. */
	shader: ConsumerShader;
	bindings: readonly KernelBindingTemplate[];
	/** Binding name -> concrete WGSL type string. */
	wgslTypes: ReadonlyMap<string, string>;
	/** Binding name -> resourceId. */
	resourceIds: ReadonlyMap<string, string>;
	/** resourceId -> the real, already-allocated GPU resource. */
	resources: ReadonlyMap<string, ComputeKernelResource>;
	/** output name -> generated fn name driving cs_main's body. */
	outputFns: Record<string, string>;
	callArgs?: string[];
	workgroupSize: readonly [number, number, number];
	dispatch: DispatchDomain;
}

export function buildComputeBindGroupEntries(
	resolved: readonly ResolvedKernelBinding[],
	resources: ReadonlyMap<string, ComputeKernelResource>
): GPUBindGroupEntry[] {
	return resolved.map((binding) => {
		const resource = resources.get(binding.resourceId);
		if (resource === undefined) {
			throw new Error(
				`Kernel binding "${binding.name}" resolves to resource id "${binding.resourceId}", ` +
					'which has no entry in the resources map'
			);
		}
		if (resource.kind !== binding.resourceKind) {
			throw new Error(
				`Kernel binding "${binding.name}" declares resourceKind:'${binding.resourceKind}' ` +
					`but its resolved resource is kind:'${resource.kind}'`
			);
		}
		if (resource.kind === 'buffer') {
			return { binding: binding.binding, resource: { buffer: resource.buffer } };
		}
		if (resource.kind === 'texture') {
			return { binding: binding.binding, resource: resource.texture.createView() };
		}
		return { binding: binding.binding, resource: resource.sampler };
	});
}

export function buildKernelBindingDecls(
	templates: readonly KernelBindingTemplate[],
	wgslTypes: ReadonlyMap<string, string>
): BindingDecl[] {
	return templates.map((template) => {
		const wgslType = wgslTypes.get(template.name);
		if (wgslType === undefined) {
			throw new Error(`Kernel binding "${template.name}" has no declared WGSL type`);
		}
		return {
			group: 0,
			binding: template.binding,
			name: template.name,
			kind: bindingDeclKindForTemplate(template),
			wgslType
		};
	});
}

function assertPositiveInteger(value: number, context: string): void {
	if (!Number.isInteger(value) || value <= 0) {
		throw new Error(`${context} must be a positive integer, got ${value}`);
	}
}

export function resolveDispatchDomain(
	domain: DispatchDomain,
	workgroupSize: readonly [number, number, number]
): [number, number, number] {
	workgroupSize.forEach((size, index) => assertPositiveInteger(size, `workgroupSize[${index}]`));

	if (!('kind' in domain)) {
		domain.forEach((value, index) => assertPositiveInteger(value, `dispatch[${index}]`));
		return [domain[0], domain[1], domain[2]];
	}
	const [workgroupX, workgroupY] = workgroupSize;
	if (domain.kind === 'buffer') {
		assertPositiveInteger(domain.elementCount, 'dispatch.elementCount');
		return [Math.ceil(domain.elementCount / workgroupX), 1, 1];
	}
	assertPositiveInteger(domain.width, 'dispatch.width');
	assertPositiveInteger(domain.height, 'dispatch.height');
	return [Math.ceil(domain.width / workgroupX), Math.ceil(domain.height / workgroupY), 1];
}

export async function executeComputeKernel(
	device: GPUDevice,
	input: ComputeKernelInput
): Promise<void> {
	if (input.shader.stage !== 'compute') {
		throw new Error(
			`executeComputeKernel requires a compute-stage shader, got "${input.shader.stage}"`
		);
	}
	const [x, y, z] = resolveDispatchDomain(input.dispatch, input.workgroupSize);

	const resolved = resolveKernelBindings(input.bindings, 'compute', input.resourceIds);
	const bindingDecls = buildKernelBindingDecls(input.bindings, input.wgslTypes);
	const stage = assembleStageEntry(input.shader, {
		bindings: bindingDecls,
		outputFns: input.outputFns,
		callArgs: input.callArgs,
		workgroupSize: [...input.workgroupSize] as [number, number, number]
	});

	const module = device.createShaderModule({ label: 'compute-kernel', code: stage.code });
	const pipeline = await device.createComputePipelineAsync({
		label: 'compute-kernel',
		layout: 'auto',
		compute: { module, entryPoint: 'cs_main' }
	});

	const entries = buildComputeBindGroupEntries(resolved, input.resources);
	const bindGroup = device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });

	const encoder = device.createCommandEncoder({ label: 'compute-kernel' });
	const pass = encoder.beginComputePass({ label: 'compute-kernel' });
	pass.setPipeline(pipeline);
	pass.setBindGroup(0, bindGroup);
	pass.dispatchWorkgroups(x, y, z);
	pass.end();
	device.queue.submit([encoder.finish()]);
}
