import {
	getPrimitive,
	callableWgslSource,
	dataTypeToWgsl,
	describePortType,
	formatPortDefaultWgsl,
	promotableParams,
	resolveCoercion,
	resolveInputPortDefault,
	resolveParamBindings,
	resolvePortDataType,
	resolvePortType,
	typeRefToWgsl,
	type DataType,
	type GraphDocument,
	type HostBinding,
	type Node,
	type PortTypeLike,
	type PortRef,
	type WgslArgumentBinding
} from '@world-lab/graph';
import { emitCoercion } from '@world-lab/compiler';
import { Value } from '@world-lab/schema';
import { parseChannelIndex, upstreamNodeIds } from './graphReachability.js';

export interface GraphParamField {
	/** Uniform struct field name. */
	field: string;
	nodeId: string;
	paramName: string;
	defaultValue: number;
}

export interface EmittedGraphEval {
	/** WGSL body lines inside evaluate(u, v). */
	body: string[];
	/** Uniform scalar params referenced by the graph. */
	params: GraphParamField[];
	/** Final scalar expression for the requested output port. */
	resultExpr: string;
	/** Distinct input.channel indices referenced by the emitted graph slice. */
	usedChannels: number[];
}

export interface EmitGraphEvalOptions {
	uvExpr?: string;
	positionExpr?: string;
	/** When true, host.* primitives read ShaderToy uniforms instead of procedural UV. */
	shaderToy?: boolean;
	fragCoordExpr?: string;
	iResolutionExpr?: string;
	iTimeExpr?: string;
	/** WGSL expression for per-invocation `face` param (mesh-gen); overrides uniform binding. */
	faceExpr?: string;
}

function sanitizeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function portVar(nodeId: string, portId: string): string {
	return `v_${sanitizeId(nodeId)}_${sanitizeId(portId)}`;
}

function paramField(nodeId: string, paramName: string): string {
	return `p_${sanitizeId(nodeId)}_${sanitizeId(paramName)}`;
}

function wgslEntryForOutput(
	base: string,
	outPort: { id: string; name: string },
	valueOutputs: { id: string; name: string }[]
): string {
	if (valueOutputs.length <= 1) return base;
	const primary = valueOutputs[0]!;
	if (outPort.id === primary.id || outPort.name === primary.name) return base;
	return `${base}_${outPort.name}`;
}

function emitHostInput(
	node: Node,
	binding: HostBinding,
	opts: EmitGraphEvalOptions | undefined
): string {
	const outPort = node.outputs[0];
	if (!outPort) {
		throw new Error(`Host-input primitive ${node.primitive} is missing its output port`);
	}
	const variable = portVar(node.id, outPort.id);

	if (binding.context === 'invocation' && binding.key === 'uv') {
		return `let ${variable} = ${opts?.uvExpr ?? 'vec2<f32>(u, v)'};`;
	}
	if (binding.context === 'invocation' && binding.key === 'metricPosition') {
		const expr = opts?.positionExpr ?? 'vec3<f32>(u, v, 0.0)';
		return `let ${variable}: vec3<f32> = ${expr};`;
	}
	if (binding.context === 'stage-builtin' && binding.key === 'fragCoord') {
		return `let ${variable} = ${opts?.fragCoordExpr ?? 'position.xy'};`;
	}
	if (binding.context === 'stage-builtin' && binding.key === 'vertexIndex') {
		return `let ${variable}: u32 = vid;`;
	}
	if (binding.context === 'stage-builtin' && binding.key === 'instanceIndex') {
		return `let ${variable}: u32 = iid;`;
	}
	if (binding.context === 'write-target' && binding.key === 'iResolution') {
		return `let ${variable} = ${opts?.iResolutionExpr ?? 'u.iResolution'};`;
	}
	if (binding.context === 'playback' && binding.key === 'iTime') {
		return `let ${variable}: f32 = ${opts?.iTimeExpr ?? 'u.iTime'};`;
	}
	if (binding.context === 'read-resource' && binding.key === 'channel') {
		const channelIndex = parseChannelIndex(
			node.params?.channel,
			`input.channel node ${node.id}`
		);
		return (
			`let ${variable} = textureSample(channel${channelIndex}, channel${channelIndex}Sampler, ` +
			`position.xy / vec2<f32>(textureDimensions(channel${channelIndex})));`
		);
	}
	throw new Error(
		`Unsupported host binding in this evaluation context: ${binding.context}.${binding.key}`
	);
}

function findOutputPort(node: Node, portId: string) {
	return node.outputs.find((port) => port.id === portId);
}

function coerceExpr(expr: string, from: PortTypeLike, to: PortTypeLike): string {
	const plan = resolveCoercion(resolvePortType(from), resolvePortType(to));
	if (plan) return emitCoercion(plan, expr);
	throw new Error(`Type mismatch: ${describePortType(from)} -> ${describePortType(to)}`);
}

function resolveParams(node: Node): Record<string, number | boolean> {
	const primitive = getPrimitive(node.primitive);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${node.primitive}`);
	}
	const defaults = Value.Create(primitive.params) as Record<string, unknown>;
	const authored = node.params ?? {};
	return { ...defaults, ...authored } as Record<string, number | boolean>;
}

function inferArguments(
	doc: GraphDocument,
	node: Node,
	bindings?: WgslArgumentBinding[]
): WgslArgumentBinding[] {
	if (bindings && bindings.length > 0) {
		return bindings;
	}
	const primitive = getPrimitive(node.primitive);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${node.primitive}`);
	}
	const args: WgslArgumentBinding[] = [];
	for (const input of primitive.inputs) {
		args.push({ name: input.name, source: 'input' });
	}
	for (const name of promotableParams(primitive)) {
		args.push({ name, source: 'param' });
	}
	return args;
}

function collectParamFields(doc: GraphDocument, nodeIds: string[]): GraphParamField[] {
	const fields: GraphParamField[] = [];
	const seen = new Set<string>();

	for (const nodeId of nodeIds) {
		const node = doc.nodes.find((candidate) => candidate.id === nodeId);
		if (!node) continue;
		const primitive = getPrimitive(node.primitive);
		if (!primitive) continue;
		if (primitive.implementation.kind === 'host-input') continue;
		const incoming = doc.edges.filter((edge) => edge.to.node === nodeId);
		const bindings = resolveParamBindings(node, primitive, incoming);
		const params = resolveParams(node);
		for (const [paramName, value] of Object.entries(params)) {
			if (bindings[paramName]?.kind === 'edge') continue;
			if (typeof value !== 'number') continue;
			const field = paramField(nodeId, paramName);
			if (seen.has(field)) continue;
			seen.add(field);
			fields.push({
				field,
				nodeId,
				paramName,
				defaultValue: value
			});
		}
	}

	return fields;
}

export function emitGraphScalarEval(
	doc: GraphDocument,
	output: PortRef,
	opts?: EmitGraphEvalOptions
): EmittedGraphEval {
	return emitGraphEval(doc, output, 'f32', 'emitGraphScalarEval requires scalar f32 output', opts);
}

export function emitGraphVec4Eval(
	doc: GraphDocument,
	output: PortRef,
	opts?: EmitGraphEvalOptions
): EmittedGraphEval {
	return emitGraphEval(doc, output, 'vec4f', 'emitGraphVec4Eval requires vec4f output', opts);
}

export function emitGraphVec2Eval(
	doc: GraphDocument,
	output: PortRef,
	opts?: EmitGraphEvalOptions
): EmittedGraphEval {
	return emitGraphEval(doc, output, 'vec2f', 'emitGraphVec2Eval requires vec2f output', opts);
}

export function emitGraphVec3Eval(
	doc: GraphDocument,
	output: PortRef,
	opts?: EmitGraphEvalOptions
): EmittedGraphEval {
	return emitGraphEval(doc, output, 'vec3f', 'emitGraphVec3Eval requires vec3f output', opts);
}

function emitGraphEval(
	doc: GraphDocument,
	output: PortRef,
	expectedOutputType: DataType,
	outputTypeError: string,
	opts?: EmitGraphEvalOptions
): EmittedGraphEval {
	const outputNode = doc.nodes.find((node) => node.id === output.node);
	if (!outputNode) {
		throw new Error(`Unknown output node: ${output.node}`);
	}
	const outputPort = findOutputPort(outputNode, output.port);
	if (!outputPort || outputPort.direction !== 'out') {
		throw new Error(`Unknown output port: ${output.node}.${output.port}`);
	}
	if (resolvePortDataType(outputPort) !== expectedOutputType) {
		throw new Error(`${outputTypeError}; got ${describePortType(outputPort)}`);
	}

	const nodeIds = upstreamNodeIds(doc, output.node);
	const body: string[] = [];
	const usedChannels = new Set<number>();

	for (const nodeId of nodeIds) {
		const node = doc.nodes.find((candidate) => candidate.id === nodeId);
		if (!node) {
			throw new Error(`Unknown node: ${nodeId}`);
		}
		const primitive = getPrimitive(node.primitive);
		if (!primitive) {
			throw new Error(`Unknown primitive: ${node.primitive}`);
		}

		if (primitive.implementation.kind === 'host-input') {
			if (
				primitive.implementation.binding.context === 'read-resource' &&
				primitive.implementation.binding.key === 'channel'
			) {
				usedChannels.add(
					parseChannelIndex(node.params?.channel, `input.channel node ${node.id}`)
				);
			}
			body.push(emitHostInput(node, primitive.implementation.binding, opts));
			continue;
		}
		const wgsl = callableWgslSource(primitive);
		if (!wgsl) {
			throw new Error(
				`Expression node ${node.id} requires a callable primitive; got ${primitive.implementation.kind}`
			);
		}

		const argValues: string[] = [];
		let hasLoop = false;
		let loopVarName = '';
		let loopCountName = '';
		let loopIndexName = '';
		let loopCallExpr = '';

		for (const binding of inferArguments(doc, node, wgsl.arguments)) {
			if (binding.source === 'param' && binding.name === 'face' && opts?.faceExpr) {
				argValues.push(`i32(${opts.faceExpr})`);
				continue;
			}
			if (binding.source === 'param') {
				const incoming = doc.edges.filter((edge) => edge.to.node === node.id);
				const paramBindings = resolveParamBindings(node, primitive, incoming);
				const paramBinding = paramBindings[binding.name];
				if (paramBinding?.kind === 'edge') {
					const upstreamNode = doc.nodes.find(
						(candidate) => candidate.id === paramBinding.from.node
					);
					if (!upstreamNode) {
						throw new Error(`Unknown upstream node: ${paramBinding.from.node}`);
					}
					const upstreamPort = findOutputPort(upstreamNode, paramBinding.from.port);
					if (!upstreamPort) {
						throw new Error(
							`Unknown upstream port: ${paramBinding.from.node}.${paramBinding.from.port}`
						);
					}
					const expr = portVar(paramBinding.from.node, paramBinding.from.port);
					const paramPort = node.inputs.find((port) => port.id === binding.name);
					const targetType: PortTypeLike = paramPort ?? { dataType: 'f32' };
					argValues.push(coerceExpr(expr, upstreamPort, targetType));
				} else {
					argValues.push(`params.${paramField(node.id, binding.name)}`);
				}
				continue;
			}

			const inputPort = node.inputs.find((port) => port.name === binding.name || port.id === binding.name);
			if (!inputPort) {
				throw new Error(`Missing input port ${binding.name} on ${node.id}`);
			}

			const inputDataType = resolvePortDataType(inputPort);
			const isTuple =
				inputDataType !== undefined &&
				inputDataType.startsWith('tuple<') &&
				inputDataType.endsWith('>');

			if (isTuple) {
				const edges = doc.edges.filter(
					(candidate) => candidate.to.node === node.id && candidate.to.port === inputPort.id
				);

				const innerType = inputDataType.slice(6, -1) as DataType;
				const wgslType = dataTypeToWgsl(innerType);

				if (edges.length === 1) {
					// Check if the upstream output dataType is 'storageBuffer'
					const edge = edges[0]!;
					const upstreamNode = doc.nodes.find((candidate) => candidate.id === edge.from.node);
					if (!upstreamNode) throw new Error(`Unknown upstream node: ${edge.from.node}`);
					const upstreamPort = findOutputPort(upstreamNode, edge.from.port);
					if (!upstreamPort) throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);

					if (resolvePortDataType(upstreamPort) === 'storageBuffer') {
						// Dynamic case: emit a for loop!
						hasLoop = true;
						loopVarName = portVar(edge.from.node, edge.from.port);
						loopCountName = `count_${sanitizeId(node.id)}_${sanitizeId(inputPort.id)}`;
						loopIndexName = `i_${sanitizeId(node.id)}_${sanitizeId(inputPort.id)}`;
						
						// The call inside the loop uses buf[i] instead of the tuple argument
						loopCallExpr = `${wgsl.entry}(${loopVarName}[${loopIndexName}])`;
						continue;
					}
				}

				// Static case (or connected to multiple edges of T): unroll!
				const argExprs: string[] = [];
				for (const edge of edges) {
					const upstreamNode = doc.nodes.find((candidate) => candidate.id === edge.from.node);
					if (!upstreamNode) throw new Error(`Unknown upstream node: ${edge.from.node}`);
					const upstreamPort = findOutputPort(upstreamNode, edge.from.port);
					if (!upstreamPort) throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);

					const expr = portVar(edge.from.node, edge.from.port);
					argExprs.push(coerceExpr(expr, upstreamPort, { dataType: innerType }));
				}

				if (argExprs.length > 0) {
					argValues.push(`array<${wgslType}, ${argExprs.length}>(${argExprs.join(', ')})`);
				} else {
					throw new Error(`Missing edge for tuple port ${node.id}.${inputPort.id}`);
				}
			} else {
				// Non-tuple input
				const edge = doc.edges.find(
					(candidate) => candidate.to.node === node.id && candidate.to.port === inputPort.id
				);
				if (!edge) {
					const portDefault = resolveInputPortDefault(node, inputPort, primitive);
					if (portDefault !== undefined) {
						if (!inputDataType) {
							throw new Error(`Port defaults require a legacy data type: ${inputPort.name}`);
						}
						argValues.push(formatPortDefaultWgsl(portDefault, inputDataType));
						continue;
					}
					throw new Error(`Missing edge for ${node.id}.${inputPort.id}`);
				}

				const upstreamNode = doc.nodes.find((candidate) => candidate.id === edge.from.node);
				if (!upstreamNode) {
					throw new Error(`Unknown upstream node: ${edge.from.node}`);
				}
				const upstreamPort = findOutputPort(upstreamNode, edge.from.port);
				if (!upstreamPort) {
					throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);
				}

				const expr = portVar(edge.from.node, edge.from.port);
				argValues.push(coerceExpr(expr, upstreamPort, inputPort));
			}
		}

		const isValueType = (type: PortTypeLike) => {
			const alias = resolvePortDataType(type);
			return type.type?.kind === 'scalar' ||
				type.type?.kind === 'vector' ||
				type.type?.kind === 'matrix' ||
				(alias !== undefined &&
					(['f32', 'vec2f', 'vec3f', 'vec4f', 'bool'].includes(alias) ||
						(alias.startsWith('tuple<') && alias.endsWith('>'))));
		};

		const valueOutputs = node.outputs.filter(isValueType);

		if (valueOutputs.length > 0) {
			if (hasLoop) {
				for (const outPort of valueOutputs) {
					const lhsVar = portVar(node.id, outPort.id);
					const lhsType = typeRefToWgsl(resolvePortType(outPort));
					const entry = wgslEntryForOutput(wgsl.entry, outPort, valueOutputs);
					const loopExpr = loopCallExpr.replace(
						`${wgsl.entry}(`,
						`${entry}(`
					);
					body.push(`var ${lhsVar}: ${lhsType} = ${lhsType === 'f32' ? '0.0' : `${lhsType}()`};`);
					body.push(`let ${loopCountName} = arrayLength(&${loopVarName});`);
					body.push(`for (var ${loopIndexName}: u32 = 0u; ${loopIndexName} < ${loopCountName}; ${loopIndexName} = ${loopIndexName} + 1u) {`);
					body.push(`\t${lhsVar} = ${lhsVar} + ${loopExpr};`);
					body.push(`}`);
				}
			} else {
				for (const outPort of valueOutputs) {
					const entry = wgslEntryForOutput(wgsl.entry, outPort, valueOutputs);
					const callExpr = `${entry}(${argValues.join(', ')})`;
					const lhsType = typeRefToWgsl(resolvePortType(outPort));
					body.push(`let ${portVar(node.id, outPort.id)}: ${lhsType} = ${callExpr};`);
				}
			}
		}
	}

	return {
		body,
		params: collectParamFields(doc, nodeIds),
		resultExpr: portVar(output.node, output.port),
		usedChannels: [...usedChannels].sort((a, b) => a - b)
	};
}

export function buildParamsStructWgsl(fields: GraphParamField[]): string {
	const lines = fields.map((field) => `\t${field.field}: f32,`);
	return `struct GraphParams {\n\twidth: f32,\n\theight: f32,\n${lines.join('\n')}\n}\n`;
}
