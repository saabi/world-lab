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

/** A named, typed value passed from a vertex kernel to its paired fragment kernel. */
export interface VaryingDecl {
	/** WGSL struct field name - also the `@location(n)` field identifier. */
	name: string;
	/** WGSL scalar/vector type, e.g. 'f32', 'vec2f', 'vec3f', 'vec4f'. */
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
	/** Named, typed values shared between a vertex/fragment kernel pair. */
	varyings?: VaryingDecl[];
	/** Struct type name shared by both stages. Defaults to 'VSOut'. */
	varyingsStructName?: string;
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

const WGSL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

const WGSL_RESERVED_WORDS = new Set([
	'alias',
	'break',
	'case',
	'const',
	'const_assert',
	'continue',
	'continuing',
	'default',
	'diagnostic',
	'discard',
	'else',
	'enable',
	'false',
	'fn',
	'for',
	'if',
	'let',
	'loop',
	'override',
	'requires',
	'return',
	'struct',
	'switch',
	'true',
	'var',
	'while'
]);

function assertValidWgslIdentifier(name: string, context: string): void {
	if (!WGSL_IDENTIFIER.test(name)) {
		throw new Error(`${context} has an invalid WGSL identifier: "${name}"`);
	}
	if (WGSL_RESERVED_WORDS.has(name)) {
		throw new Error(`${context} uses a reserved WGSL keyword: "${name}"`);
	}
}

function validateVaryings(structName: string, varyings: readonly VaryingDecl[]): void {
	assertValidWgslIdentifier(structName, 'Varyings struct name');
	const seen = new Set<string>();
	for (const varying of varyings) {
		assertValidWgslIdentifier(varying.name, `Varying "${varying.name}"`);
		if (seen.has(varying.name)) {
			throw new Error(`Duplicate varying name: "${varying.name}"`);
		}
		seen.add(varying.name);
	}
}

export function varyingsStructWgsl(
	structName: string,
	varyings: readonly VaryingDecl[]
): string {
	validateVaryings(structName, varyings);
	const fields = varyings
		.map((varying, index) => `\t@location(${index}) ${varying.name}: ${varying.wgslType},\n`)
		.join('');
	return `struct ${structName} {\n\t@builtin(position) position: vec4f,\n${fields}};`;
}

function assertNoDuplicateVaryingNames(
	varyings: readonly VaryingDecl[],
	side: 'vertex' | 'fragment'
): void {
	const seen = new Set<string>();
	for (const varying of varyings) {
		if (seen.has(varying.name)) {
			throw new Error(`Duplicate varying name on the ${side} side: "${varying.name}"`);
		}
		seen.add(varying.name);
	}
}

export function assertVaryingsMatch(
	vertexVaryings: readonly VaryingDecl[],
	fragmentVaryings: readonly VaryingDecl[]
): void {
	assertNoDuplicateVaryingNames(vertexVaryings, 'vertex');
	assertNoDuplicateVaryingNames(fragmentVaryings, 'fragment');

	const vertexByName = new Map(vertexVaryings.map((v) => [v.name, v.wgslType]));
	const fragmentByName = new Map(fragmentVaryings.map((v) => [v.name, v.wgslType]));
	const problems: string[] = [];

	for (const [name, wgslType] of fragmentByName) {
		const vertexType = vertexByName.get(name);
		if (vertexType === undefined) {
			problems.push(`fragment expects varying "${name}" but the vertex kernel does not produce it`);
		} else if (vertexType !== wgslType) {
			problems.push(
				`varying "${name}" type mismatch: vertex produces ${vertexType}, fragment expects ${wgslType}`
			);
		}
	}
	for (const name of vertexByName.keys()) {
		if (!fragmentByName.has(name)) {
			problems.push(`vertex produces varying "${name}" that the fragment kernel does not declare`);
		}
	}

	if (problems.length > 0) {
		throw new Error(`Vertex/fragment varying mismatch:\n${problems.join('\n')}`);
	}
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
		const varyings = opts.varyings ?? [];
		if (varyings.length > 0) {
			const structName = opts.varyingsStructName ?? 'VSOut';
			validateVaryings(structName, varyings);
			entry = `@fragment\nfn fs_main(input: ${structName}) -> @location(0) vec4f {\n\treturn ${fn}(${args});\n}`;
		} else {
			entry = `@fragment\nfn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {\n\treturn ${fn}(${args});\n}`;
		}
	} else if (shader.stage === 'compute') {
		const [x, y, z] = opts.workgroupSize ?? [64, 1, 1];
		entry = `@compute @workgroupSize(${x}, ${y}, ${z})\nfn cs_main(@builtin(global_invocation_id) gid: vec3u) {\n\t${fn}(${args});\n}`;
	} else if (shader.stage === 'vertex') {
		const varyings = opts.varyings ?? [];
		const structName = opts.varyingsStructName ?? 'VSOut';
		const struct = varyingsStructWgsl(structName, varyings);
		const assignments = varyings.map((varying) => {
			const varyingFn = opts.outputFns[varying.name];
			if (varyingFn === undefined) {
				throw new Error(
					`No output fn provided for varying '${varying.name}' (consumer ${shader.consumerId})`
				);
			}
			return `\tout.${varying.name} = ${varyingFn}(${args});`;
		});
		const body = [
			`\tvar out: ${structName};`,
			`\tout.position = ${fn}(${args});`,
			...assignments,
			`\treturn out;`
		];
		entry = `${struct}\n@vertex\nfn vs_main(@builtin(vertex_index) vid: u32, @builtin(instance_index) iid: u32) -> ${structName} {\n${body.join('\n')}\n}`;
	} else {
		throw new Error(`Unsupported stage '${shader.stage}' — supply entryOverride`);
	}

	const decls = bindings.map(bindingVar).join('\n');
	const code = [decls, shader.code, entry].filter((s) => s.length > 0).join('\n\n');

	return { consumerId: shader.consumerId, stage: shader.stage, code, bindings };
}
