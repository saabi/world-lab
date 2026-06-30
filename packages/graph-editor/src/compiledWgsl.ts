import { assembleStageEntry, compileGraph, type WgslModuleResolver } from '@virtual-planet/compiler';
import type { GraphDocument, PortRef, ProceduralConsumer } from '@virtual-planet/graph';
import {
	assembleFullscreenFragmentModuleAsync,
	buildParamsStructWgsl,
	createStandardLibraryResolver,
	emitGraphScalarEval,
	type GraphParamField
} from '@virtual-planet/runtime-webgpu';

import { outputPortDataType, primaryPreviewOutput } from './graphBuilders.js';
import { fullValidation, incompleteGraphMessage } from './graphValidation.js';
import { inferPreviewBackend } from './previewBackend.js';

export interface CompiledConsumerWgsl {
	consumerId: string;
	stage: string;
	outputs: string[];
	/** Final assembled WGSL for this consumer, or empty when `diagnostic` is set. */
	code: string;
	/** Compile/validation message — panel shows this instead of crashing. */
	diagnostic?: string;
}

function compileDiagnostic(error: unknown): string {
	const message = error instanceof Error ? error.message : String(error);
	if (/missing edge|unknown primitive|not declared|no path/i.test(message)) {
		return `Graph incomplete: ${message}`;
	}
	return message;
}

function findOutputName(doc: GraphDocument, output: PortRef): string {
	const match = doc.outputs.find(
		(candidate) => candidate.from.node === output.node && candidate.from.port === output.port
	);
	if (!match) {
		throw new Error(`Output port is not declared in graph.outputs: ${output.node}.${output.port}`);
	}
	return match.name;
}

function buildScalarPreviewShader(
	moduleCode: string,
	evalBody: string[],
	resultExpr: string,
	params: GraphParamField[]
): string {
	const paramsStruct = buildParamsStructWgsl(params);
	return `${moduleCode}

${paramsStruct}

@group(0) @binding(0) var<uniform> params: GraphParams;
@group(0) @binding(1) var<storage, read_write> out_pixels: array<u32>;

fn evaluate(u: f32, v: f32) -> f32 {
${evalBody.map((line) => `\t${line}`).join('\n')}
\treturn ${resultExpr};
}

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
	let width = u32(params.width);
	let height = u32(params.height);
	if (gid.x >= width || gid.y >= height) {
		return;
	}

	let u = f32(gid.x) / f32(max(1u, width - 1u));
	let v = f32(gid.y) / f32(max(1u, height - 1u));
	let scalar = clamp(evaluate(u, v), 0.0, 1.0);
	let byte = u32(scalar * 255.0);
	let rgba = byte | (byte << 8u) | (byte << 16u) | (0xffu << 24u);
	out_pixels[gid.y * width + gid.x] = rgba;
}`;
}

async function compileScalarPreviewConsumer(
	doc: GraphDocument,
	consumer: ProceduralConsumer,
	output: PortRef,
	resolver: WgslModuleResolver
): Promise<CompiledConsumerWgsl> {
	const consumerId = consumer.id ?? consumer.type;
	try {
		const outputName = findOutputName(doc, output);
		const compiled = await compileGraph(doc, resolver, { consumers: [consumer] });
		const consumerShader = compiled.shaders[0];
		if (!consumerShader) {
			return {
				consumerId,
				stage: consumer.stage ?? 'compute',
				outputs: consumer.outputs,
				code: '',
				diagnostic: 'compileGraph produced no shaders'
			};
		}

		const emitted = emitGraphScalarEval(doc, output);
		const code = buildScalarPreviewShader(
			consumerShader.code,
			emitted.body,
			emitted.resultExpr,
			emitted.params
		);
		return {
			consumerId,
			stage: 'compute',
			outputs: consumer.outputs,
			code
		};
	} catch (error) {
		return {
			consumerId,
			stage: consumer.stage ?? 'compute',
			outputs: consumer.outputs,
			code: '',
			diagnostic: compileDiagnostic(error)
		};
	}
}

async function compileFragmentImageConsumer(
	doc: GraphDocument,
	consumer: ProceduralConsumer,
	output: PortRef,
	resolver: WgslModuleResolver
): Promise<CompiledConsumerWgsl> {
	const consumerId = consumer.id ?? consumer.type;
	try {
		const { code } = await assembleFullscreenFragmentModuleAsync(doc, output, resolver, consumer);
		return {
			consumerId,
			stage: consumer.stage ?? 'fragment',
			outputs: consumer.outputs,
			code
		};
	} catch (error) {
		return {
			consumerId,
			stage: consumer.stage ?? 'fragment',
			outputs: consumer.outputs,
			code: '',
			diagnostic: compileDiagnostic(error)
		};
	}
}

async function compileStagedConsumer(
	doc: GraphDocument,
	consumer: ProceduralConsumer,
	resolver: WgslModuleResolver
): Promise<CompiledConsumerWgsl> {
	const consumerId = consumer.id ?? consumer.type;
	const stage = consumer.stage ?? 'unknown';
	try {
		const compiled = await compileGraph(doc, resolver, { consumers: [consumer] });
		const consumerShader = compiled.shaders[0];
		if (!consumerShader) {
			return {
				consumerId,
				stage,
				outputs: consumer.outputs,
				code: '',
				diagnostic: 'compileGraph produced no shaders'
			};
		}

		const outputName = consumer.outputs[0];
		if (!outputName) {
			return {
				consumerId,
				stage,
				outputs: consumer.outputs,
				code: '',
				diagnostic: 'Consumer has no outputs'
			};
		}

		const graphOutput = doc.outputs.find((candidate) => candidate.name === outputName);
		if (!graphOutput) {
			return {
				consumerId,
				stage,
				outputs: consumer.outputs,
				code: '',
				diagnostic: `Missing graph.outputs entry for '${outputName}'`
			};
		}

		const dataType = outputPortDataType(doc, graphOutput.from);
		if (stage === 'fragment' && dataType === 'vec4f') {
			return compileFragmentImageConsumer(doc, consumer, graphOutput.from, resolver);
		}

		if (dataType === 'f32') {
			return compileScalarPreviewConsumer(doc, consumer, graphOutput.from, resolver);
		}

		const entryFn = consumerShader.outputs[0] ?? outputName;
		const assembled = assembleStageEntry(consumerShader, {
			output: outputName,
			outputFns: { [outputName]: entryFn },
			callArgs: stage === 'vertex' ? ['vid', 'iid'] : stage === 'compute' ? ['gid'] : []
		});
		return {
			consumerId,
			stage,
			outputs: consumer.outputs,
			code: assembled.code
		};
	} catch (error) {
		return {
			consumerId,
			stage,
			outputs: consumer.outputs,
			code: '',
			diagnostic: compileDiagnostic(error)
		};
	}
}

/** Compile every consumer of `doc` to its final WGSL (reuses runtime assembly paths). */
export async function compiledGraphWgsl(
	doc: GraphDocument,
	resolver: WgslModuleResolver = createStandardLibraryResolver()
): Promise<CompiledConsumerWgsl[]> {
	const validation = fullValidation(doc);
	const blocked = incompleteGraphMessage(validation);
	if (blocked) {
		return [
			{
				consumerId: '(graph)',
				stage: 'n/a',
				outputs: [],
				code: '',
				diagnostic: blocked
			}
		];
	}

	if (doc.consumers.length === 0) {
		return [
			{
				consumerId: '(graph)',
				stage: 'n/a',
				outputs: [],
				code: '',
				diagnostic: 'Graph has no consumers'
			}
		];
	}

	const results: CompiledConsumerWgsl[] = [];

	if (inferPreviewBackend(doc) === 'effect') {
		const output = primaryPreviewOutput(doc);
		const consumer = doc.consumers.find((candidate) => candidate.stage === 'fragment') ?? doc.consumers[0]!;
		if (!output) {
			return [
				{
					consumerId: consumer.id ?? consumer.type,
					stage: 'fragment',
					outputs: consumer.outputs,
					code: '',
					diagnostic: 'Fragment image graph has no declared output port'
				}
			];
		}
		results.push(await compileFragmentImageConsumer(doc, consumer, output, resolver));
		return results;
	}

	for (const consumer of doc.consumers) {
		const output = primaryPreviewOutput(doc);
		if ((consumer.type === 'preview' || !consumer.stage) && output) {
			results.push(await compileScalarPreviewConsumer(doc, consumer, output, resolver));
			continue;
		}
		results.push(await compileStagedConsumer(doc, consumer, resolver));
	}

	return results;
}
