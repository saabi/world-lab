import type { ConsumerShader } from './compileGraph.js';
import type { KernelBindingTemplate } from '@world-lab/graph';

/** A binding the stage entry exposes (host/runtime input, resource, instance buffer). */
export interface BindingDecl {
	group: number;
	binding: number;
	name: string;
	kind: 'uniform' | 'storage-read' | 'storage-read-write' | 'texture' | 'sampler';
	/** WGSL type, e.g. 'ViewUniforms', 'array<Patch>', 'texture_2d<f32>', 'sampler'. */
	wgslType: string;
}

export interface StageEntryOptions {
	/** Bindings declared before the function library. */
	bindings?: BindingDecl[];
	/** Compute workgroup size (compute stage only; defaults to [64,1,1]). */
	workgroupSize?: [number, number, number];
	/** Which graph output drives the entry (defaults to `shader.outputs[0]`). */
	output?: string;
	/** output name → the generated fn that produces it (from the slice). */
	outputFns: Record<string, string>;
	/** Verbatim WGSL expressions passed to the output fn in the default templates. */
	callArgs?: string[];
	/** Full replacement of the entry fn WGSL (advanced; bypasses the default template). */
	entryOverride?: string;
}

export interface StageModule {
	consumerId: string;
	stage: string;
	/** Full WGSL: binding decls + the consumer's function library + the entry fn. */
	code: string;
	bindings: BindingDecl[];
}

function bindingVar(b: BindingDecl): string {
	const addr =
		b.kind === 'uniform'
			? '<uniform> '
			: b.kind === 'storage-read'
				? '<storage, read> '
				: b.kind === 'storage-read-write'
					? '<storage, read_write> '
					: ' ';
	return `@group(${b.group}) @binding(${b.binding}) var${addr}${b.name}: ${b.wgslType};`;
}

export function bindingDeclKindForTemplate(
	template: Pick<KernelBindingTemplate, 'resourceKind' | 'access'>
): BindingDecl['kind'] {
	if (template.resourceKind === 'sampler') {
		if (template.access !== 'read') {
			throw new Error(`sampler kernel bindings must declare access:'read'`);
		}
		return 'sampler';
	}
	if (template.resourceKind === 'texture') {
		if (template.access !== 'read') {
			throw new Error(
				`texture kernel bindings must declare access:'read' (storage textures are deferred - see F2.3)`
			);
		}
		return 'texture';
	}
	return template.access === 'read' ? 'storage-read' : 'storage-read-write';
}

/** Wrap a per-consumer function library (compileGraph output) into a pipeline-ready WGSL
 *  module with a stage entry point + binding declarations. Text assembly only — no AST. */
export function assembleStageEntry(shader: ConsumerShader, opts: StageEntryOptions): StageModule {
	const bindings = opts.bindings ?? [];
	const outputName = opts.output ?? shader.outputs[0];
	if (outputName === undefined) {
		throw new Error(`Consumer ${shader.consumerId} has no output to drive the entry`);
	}
	const fn = opts.outputFns[outputName];
	if (fn === undefined) {
		throw new Error(`No output fn provided for '${outputName}' (consumer ${shader.consumerId})`);
	}
	const args = (opts.callArgs ?? []).join(', ');

	let entry: string;
	if (opts.entryOverride !== undefined) {
		entry = opts.entryOverride;
	} else if (shader.stage === 'fragment') {
		entry = `@fragment\nfn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {\n\treturn ${fn}(${args});\n}`;
	} else if (shader.stage === 'compute') {
		const [x, y, z] = opts.workgroupSize ?? [64, 1, 1];
		entry = `@compute @workgroupSize(${x}, ${y}, ${z})\nfn cs_main(@builtin(global_invocation_id) gid: vec3u) {\n\t${fn}(${args});\n}`;
	} else if (shader.stage === 'vertex') {
		entry = `struct VSOut {\n\t@builtin(position) position: vec4f,\n};\n@vertex\nfn vs_main(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> VSOut {\n\tvar out: VSOut;\n\tout.position = ${fn}(${args});\n\treturn out;\n}`;
	} else {
		throw new Error(`Unsupported stage '${shader.stage}' — supply entryOverride`);
	}

	const decls = bindings.map(bindingVar).join('\n');
	const code = [decls, shader.code, entry].filter((s) => s.length > 0).join('\n\n');

	return { consumerId: shader.consumerId, stage: shader.stage, code, bindings };
}
