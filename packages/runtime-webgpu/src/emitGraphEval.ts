import {
	getPrimitive,
	type DataType,
	type GraphDocument,
	type Node,
	type PortRef,
	type WgslArgumentBinding
} from '@virtual-planet/graph';
import { Value } from '@virtual-planet/schema';

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
}

export interface EmitGraphEvalOptions {
	positionExpr?: string;
	/** When true, host.* primitives read ShaderToy uniforms instead of procedural UV. */
	shaderToy?: boolean;
	fragCoordExpr?: string;
	iResolutionExpr?: string;
	iTimeExpr?: string;
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

function topologicalSort(doc: GraphDocument, outputNodeId: string): string[] {
	const nodeMap = new Map(doc.nodes.map((node) => [node.id, node]));
	const incoming = new Map<string, Set<string>>();
	for (const node of doc.nodes) {
		incoming.set(node.id, new Set());
	}
	for (const edge of doc.edges) {
		if (!nodeMap.has(edge.from.node) || !nodeMap.has(edge.to.node)) continue;
		incoming.get(edge.to.node)?.add(edge.from.node);
	}

	const sorted: string[] = [];
	const visiting = new Set<string>();
	const visited = new Set<string>();

	const visit = (nodeId: string): void => {
		if (visited.has(nodeId)) return;
		if (visiting.has(nodeId)) {
			throw new Error(`Graph cycle detected at node: ${nodeId}`);
		}
		visiting.add(nodeId);
		for (const upstreamId of incoming.get(nodeId) ?? []) {
			visit(upstreamId);
		}
		visiting.delete(nodeId);
		visited.add(nodeId);
		sorted.push(nodeId);
	};

	if (!nodeMap.has(outputNodeId)) {
		throw new Error(`Unknown output node: ${outputNodeId}`);
	}
	visit(outputNodeId);
	return sorted;
}

function findPort(node: Node, portId: string) {
	return [...node.inputs, ...node.outputs].find((port) => port.id === portId);
}

function wgslTypeFor(dataType: DataType): string {
	switch (dataType) {
		case 'f32':
			return 'f32';
		case 'bool':
			return 'bool';
		case 'vec2f':
			return 'vec2<f32>';
		case 'vec3f':
			return 'vec3<f32>';
		case 'vec4f':
			return 'vec4<f32>';
		default:
			throw new Error(`Unsupported GPU data type: ${dataType}`);
	}
}

function promoteExpr(expr: string, fromType: DataType, toType: DataType): string {
	if (fromType === toType) return expr;
	if (fromType === 'vec2f' && toType === 'vec3f') {
		return `vec3<f32>(${expr}, 0.0)`;
	}
	throw new Error(`Type mismatch: ${fromType} -> ${toType}`);
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

function inferArguments(node: Node, bindings?: WgslArgumentBinding[]): WgslArgumentBinding[] {
	if (bindings && bindings.length > 0) {
		return bindings;
	}
	const primitive = getPrimitive(node.primitive);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${node.primitive}`);
	}
	const args: WgslArgumentBinding[] = [];
	for (const input of node.inputs) {
		args.push({ name: input.name, source: 'input' });
	}
	const params = resolveParams(node);
	for (const key of Object.keys(params)) {
		args.push({ name: key, source: 'param' });
	}
	return args;
}

function collectParamFields(doc: GraphDocument, nodeIds: string[]): GraphParamField[] {
	const fields: GraphParamField[] = [];
	const seen = new Set<string>();

	for (const nodeId of nodeIds) {
		const node = doc.nodes.find((candidate) => candidate.id === nodeId);
		if (!node) continue;
		const params = resolveParams(node);
		for (const [paramName, value] of Object.entries(params)) {
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
	const outputPort = findPort(outputNode, output.port);
	if (!outputPort || outputPort.direction !== 'out') {
		throw new Error(`Unknown output port: ${output.node}.${output.port}`);
	}
	if (outputPort.dataType !== expectedOutputType) {
		throw new Error(`${outputTypeError}; got ${outputPort.dataType}`);
	}

	const nodeIds = topologicalSort(doc, output.node);
	const body: string[] = [];

	for (const nodeId of nodeIds) {
		const node = doc.nodes.find((candidate) => candidate.id === nodeId);
		if (!node) {
			throw new Error(`Unknown node: ${nodeId}`);
		}
		const primitive = getPrimitive(node.primitive);
		if (!primitive) {
			throw new Error(`Unknown primitive: ${node.primitive}`);
		}

		if (node.primitive === 'procedural.uv') {
			const uvPort = node.outputs[0];
			if (!uvPort) {
				throw new Error('procedural.uv missing output port');
			}
			body.push(`let ${portVar(node.id, uvPort.id)} = vec2<f32>(u, v);`);
			continue;
		}

		if (opts?.shaderToy && node.primitive === 'host.fragCoord') {
			const outPort = node.outputs[0];
			if (!outPort) {
				throw new Error('host.fragCoord missing output port');
			}
			body.push(
				`let ${portVar(node.id, outPort.id)} = ${opts.fragCoordExpr ?? 'position.xy'};`
			);
			continue;
		}

		if (opts?.shaderToy && node.primitive === 'host.iResolution') {
			const outPort = node.outputs[0];
			if (!outPort) {
				throw new Error('host.iResolution missing output port');
			}
			body.push(
				`let ${portVar(node.id, outPort.id)} = ${opts.iResolutionExpr ?? 'u.iResolution'};`
			);
			continue;
		}

		if (opts?.shaderToy && node.primitive === 'host.iTime') {
			const outPort = node.outputs[0];
			if (!outPort) {
				throw new Error('host.iTime missing output port');
			}
			body.push(`let ${portVar(node.id, outPort.id)}: f32 = ${opts.iTimeExpr ?? 'u.iTime'};`);
			continue;
		}

		if (node.primitive === 'procedural.metricPosition') {
			const posPort = node.outputs[0];
			if (!posPort) {
				throw new Error('procedural.metricPosition missing output port');
			}
			const expr = opts?.positionExpr ?? 'vec3<f32>(u, v, 0.0)';
			body.push(`let ${portVar(node.id, posPort.id)}: vec3<f32> = ${expr};`);
			continue;
		}

		const argValues: string[] = [];
		let hasLoop = false;
		let loopVarName = '';
		let loopCountName = '';
		let loopIndexName = '';
		let loopCallExpr = '';

		for (const binding of inferArguments(node, primitive.wgsl.arguments)) {
			if (binding.source === 'param') {
				argValues.push(`params.${paramField(node.id, binding.name)}`);
				continue;
			}

			const inputPort = node.inputs.find((port) => port.name === binding.name || port.id === binding.name);
			if (!inputPort) {
				throw new Error(`Missing input port ${binding.name} on ${node.id}`);
			}

			const isList = inputPort.dataType.startsWith('list<') && inputPort.dataType.endsWith('>');

			if (isList) {
				const edges = doc.edges.filter(
					(candidate) => candidate.to.node === node.id && candidate.to.port === inputPort.id
				);

				const innerType = inputPort.dataType.slice(5, -1) as DataType;
				const wgslType = wgslTypeFor(innerType);

				if (edges.length === 1) {
					// Check if the upstream output dataType is 'storageBuffer'
					const edge = edges[0]!;
					const upstreamNode = doc.nodes.find((candidate) => candidate.id === edge.from.node);
					if (!upstreamNode) throw new Error(`Unknown upstream node: ${edge.from.node}`);
					const upstreamPort = findPort(upstreamNode, edge.from.port);
					if (!upstreamPort) throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);

					if (upstreamPort.dataType === 'storageBuffer') {
						// Dynamic case: emit a for loop!
						hasLoop = true;
						loopVarName = portVar(edge.from.node, edge.from.port);
						loopCountName = `count_${sanitizeId(node.id)}_${sanitizeId(inputPort.id)}`;
						loopIndexName = `i_${sanitizeId(node.id)}_${sanitizeId(inputPort.id)}`;
						
						// The call inside the loop uses buf[i] instead of list argument
						loopCallExpr = `${primitive.wgsl.entry}(${loopVarName}[${loopIndexName}])`;
						continue;
					}
				}

				// Static case (or connected to multiple edges of T): unroll!
				const argExprs: string[] = [];
				for (const edge of edges) {
					const upstreamNode = doc.nodes.find((candidate) => candidate.id === edge.from.node);
					if (!upstreamNode) throw new Error(`Unknown upstream node: ${edge.from.node}`);
					const upstreamPort = findPort(upstreamNode, edge.from.port);
					if (!upstreamPort) throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);

					const expr = portVar(edge.from.node, edge.from.port);
					argExprs.push(promoteExpr(expr, upstreamPort.dataType, innerType));
				}

				if (argExprs.length > 0) {
					argValues.push(`array<${wgslType}, ${argExprs.length}>(${argExprs.join(', ')})`);
				} else {
					throw new Error(`Missing edge for list port ${node.id}.${inputPort.id}`);
				}
			} else {
				// Non-list input
				const edge = doc.edges.find(
					(candidate) => candidate.to.node === node.id && candidate.to.port === inputPort.id
				);
				if (!edge) {
					throw new Error(`Missing edge for ${node.id}.${inputPort.id}`);
				}

				const upstreamNode = doc.nodes.find((candidate) => candidate.id === edge.from.node);
				if (!upstreamNode) {
					throw new Error(`Unknown upstream node: ${edge.from.node}`);
				}
				const upstreamPort = findPort(upstreamNode, edge.from.port);
				if (!upstreamPort) {
					throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);
				}

				const expr = portVar(edge.from.node, edge.from.port);
				argValues.push(promoteExpr(expr, upstreamPort.dataType, inputPort.dataType));
			}
		}

		const isValueType = (type: DataType) =>
			['f32', 'vec2f', 'vec3f', 'vec4f', 'bool'].includes(type) ||
			(type.startsWith('list<') && type.endsWith('>'));

		const valueOutputs = node.outputs.filter((o) => isValueType(o.dataType));

		if (valueOutputs.length > 0) {
			if (hasLoop) {
				for (const outPort of valueOutputs) {
					const lhsVar = portVar(node.id, outPort.id);
					const lhsType = wgslTypeFor(outPort.dataType);
					body.push(`var ${lhsVar}: ${lhsType} = ${lhsType === 'f32' ? '0.0' : `${lhsType}()`};`);
					body.push(`let ${loopCountName} = arrayLength(&${loopVarName});`);
					body.push(`for (var ${loopIndexName}: u32 = 0u; ${loopIndexName} < ${loopCountName}; ${loopIndexName} = ${loopIndexName} + 1u) {`);
					body.push(`\t${lhsVar} = ${lhsVar} + ${loopCallExpr};`);
					body.push(`}`);
				}
			} else {
				for (const outPort of valueOutputs) {
					const callExpr = `${primitive.wgsl.entry}(${argValues.join(', ')})`;
					const lhsType = wgslTypeFor(outPort.dataType);
					body.push(`let ${portVar(node.id, outPort.id)}: ${lhsType} = ${callExpr};`);
				}
			}
		}
	}

	return {
		body,
		params: collectParamFields(doc, nodeIds),
		resultExpr: portVar(output.node, output.port)
	};
}

export function buildParamsStructWgsl(fields: GraphParamField[]): string {
	const lines = fields.map((field) => `\t${field.field}: f32,`);
	return `struct GraphParams {\n\twidth: f32,\n\theight: f32,\n${lines.join('\n')}\n}\n`;
}
