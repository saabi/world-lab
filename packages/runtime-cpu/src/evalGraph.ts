import {
	getPrimitive,
	resolveInputPortDefault,
	resolveParamBindings,
	type CpuValue,
	type DataType,
	type GraphDocument,
	type Node,
	type NodePrimitive,
	type PortRef
} from '@world-lab/graph';
import { Value } from '@world-lab/schema';

export interface EvalGraphSample {
	/** Procedural inputs for this sample (e.g. uv: [u, v]). */
	procedural?: Record<string, CpuValue>;
	/** Per-node param overrides for this sample (e.g. mesh-gen face sweep). */
	nodeParams?: Record<string, Record<string, number | boolean>>;
}

export interface EvalGraphOptions {
	/** Optional resolver for resource ports — M9 may omit (graphs without resources). */
	resolveResource?: (portRef: PortRef) => CpuValue | undefined;
}

const RESOURCE_TYPES = new Set<DataType>(['image', 'mesh', 'audio']);

function findOutputPort(node: Node, portId: string) {
	return node.outputs.find((port) => port.id === portId);
}

function coerceInputValue(value: CpuValue, fromType: DataType, toType: DataType): CpuValue {
	if (fromType === toType) return value;
	if (fromType === 'vec2f' && toType === 'vec3f' && Array.isArray(value) && value.length === 2) {
		return [value[0], value[1], 0];
	}
	throw new Error(`Type mismatch: ${fromType} -> ${toType}`);
}

function resolveParams(
	doc: GraphDocument,
	node: Node,
	primitive: NodePrimitive,
	nodeOutputs: Map<string, Record<string, CpuValue>>,
	sample?: EvalGraphSample
): Record<string, number | boolean> {
	const incoming = doc.edges.filter((edge) => edge.to.node === node.id);
	const bindings = resolveParamBindings(node, primitive, incoming);
	const resolved: Record<string, number | boolean> = {};
	const defaults = Value.Create(primitive.params) as Record<string, unknown>;
	const authored = node.params ?? {};

	for (const [key, binding] of Object.entries(bindings)) {
		if (binding.kind === 'edge') {
			const fromNode = doc.nodes.find((candidate) => candidate.id === binding.from.node);
			if (!fromNode) {
				throw new Error(`Unknown upstream node: ${binding.from.node}`);
			}
			const fromPort = findOutputPort(fromNode, binding.from.port);
			if (!fromPort) {
				throw new Error(`Unknown upstream port: ${binding.from.node}.${binding.from.port}`);
			}
			const upstreamOutputs = nodeOutputs.get(binding.from.node);
			if (!upstreamOutputs || !(binding.from.port in upstreamOutputs)) {
				throw new Error(`Missing upstream value: ${binding.from.node}.${binding.from.port}`);
			}
			const value = coerceInputValue(
				upstreamOutputs[binding.from.port]!,
				fromPort.dataType,
				'f32'
			);
			if (typeof value !== 'number' && typeof value !== 'boolean') {
				throw new Error(`Param ${key} requires scalar upstream value`);
			}
			resolved[key] = value;
			continue;
		}
		if (binding.kind === 'literal') {
			resolved[key] = binding.value;
		}
	}

	for (const [key, value] of Object.entries({ ...defaults, ...authored })) {
		if (key in resolved) continue;
		if (typeof value === 'number' || typeof value === 'boolean') {
			resolved[key] = value;
		}
	}

	const overrides = sample?.nodeParams?.[node.id];
	if (overrides) {
		for (const [key, value] of Object.entries(overrides)) {
			if (typeof value === 'number' || typeof value === 'boolean') {
				resolved[key] = value;
			}
		}
	}

	return resolved;
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

function evaluateNode(
	doc: GraphDocument,
	node: Node,
	nodeOutputs: Map<string, Record<string, CpuValue>>,
	sample: EvalGraphSample,
	options?: EvalGraphOptions
): Record<string, CpuValue> {
	const primitive = getPrimitive(node.primitive);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${node.primitive}`);
	}
	if (!primitive.evalCPU) {
		throw new Error(`Primitive missing evalCPU: ${node.primitive}`);
	}

	const inputs: Record<string, CpuValue> = {};
	for (const inputPort of node.inputs) {
		const edge = doc.edges.find(
			(candidate) => candidate.to.node === node.id && candidate.to.port === inputPort.id
		);
		if (!edge) {
			const portDefault = resolveInputPortDefault(node, inputPort, primitive);
			if (portDefault !== undefined) {
				inputs[inputPort.name] = portDefault as CpuValue;
			}
			continue;
		}

		if (RESOURCE_TYPES.has(inputPort.dataType)) {
			const resolved = options?.resolveResource?.(edge.from);
			if (resolved === undefined) {
				throw new Error(`Missing resource resolver for port: ${edge.from.node}.${edge.from.port}`);
			}
			inputs[inputPort.name] = resolved;
			continue;
		}

		const fromNode = doc.nodes.find((candidate) => candidate.id === edge.from.node);
		if (!fromNode) {
			throw new Error(`Unknown upstream node: ${edge.from.node}`);
		}

		const fromPort = findOutputPort(fromNode, edge.from.port);
		if (!fromPort) {
			throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);
		}

		const upstreamOutputs = nodeOutputs.get(edge.from.node);
		if (!upstreamOutputs || !(edge.from.port in upstreamOutputs)) {
			throw new Error(`Missing upstream value: ${edge.from.node}.${edge.from.port}`);
		}

		inputs[inputPort.name] = coerceInputValue(
			upstreamOutputs[edge.from.port],
			fromPort.dataType,
			inputPort.dataType
		);
	}

	const params = resolveParams(doc, node, primitive, nodeOutputs, sample);
	const raw = primitive.evalCPU({
		inputs,
		params,
		procedural: sample.procedural
	});

	const outputs: Record<string, CpuValue> = {};
	for (const port of node.outputs) {
		if (port.name in raw) {
			outputs[port.id] = raw[port.name]!;
			continue;
		}
		if (port.id in raw) {
			outputs[port.id] = raw[port.id]!;
			continue;
		}
	}

	// Single-output fallback when evalCPU keys lag a renamed port in the registry.
	if (node.outputs.length === 1 && node.outputs[0] && Object.keys(raw).length === 1) {
		const onlyPort = node.outputs[0];
		const onlyValue = raw[Object.keys(raw)[0]!]!;
		if (!(onlyPort.id in outputs)) {
			outputs[onlyPort.id] = onlyValue;
		}
	}

	return outputs;
}

export function evaluateGraphOutput(
	doc: GraphDocument,
	output: PortRef,
	sample: EvalGraphSample,
	options?: EvalGraphOptions
): CpuValue {
	const outputNode = doc.nodes.find((node) => node.id === output.node);
	if (!outputNode) {
		throw new Error(`Unknown output node: ${output.node}`);
	}

	const outputPort = findOutputPort(outputNode, output.port);
	if (!outputPort || outputPort.direction !== 'out') {
		throw new Error(`Unknown output port: ${output.node}.${output.port}`);
	}

	if (outputPort.dataType !== 'f32') {
		throw new Error(
			`evaluateGraphOutput requires scalar f32 output; got ${outputPort.dataType}`
		);
	}

	const nodeOutputs = new Map<string, Record<string, CpuValue>>();
	for (const nodeId of topologicalSort(doc, output.node)) {
		const node = doc.nodes.find((candidate) => candidate.id === nodeId);
		if (!node) {
			throw new Error(`Unknown node: ${nodeId}`);
		}
		nodeOutputs.set(nodeId, evaluateNode(doc, node, nodeOutputs, sample, options));
	}

	const result = nodeOutputs.get(output.node)?.[output.port];
	if (result === undefined) {
		throw new Error(`Missing output value: ${output.node}.${output.port}`);
	}
	if (typeof result !== 'number') {
		throw new Error(
			`evaluateGraphOutput requires scalar f32 output; got ${Array.isArray(result) ? 'array' : typeof result}`
		);
	}
	return result;
}

export function evaluateGraphVec3Output(
	doc: GraphDocument,
	output: PortRef,
	sample: EvalGraphSample,
	options?: EvalGraphOptions
): number[] {
	const outputNode = doc.nodes.find((node) => node.id === output.node);
	if (!outputNode) {
		throw new Error(`Unknown output node: ${output.node}`);
	}

	const outputPort = findOutputPort(outputNode, output.port);
	if (!outputPort || outputPort.direction !== 'out') {
		throw new Error(`Unknown output port: ${output.node}.${output.port}`);
	}

	if (outputPort.dataType !== 'vec3f') {
		throw new Error(
			`evaluateGraphVec3Output requires vec3f output; got ${outputPort.dataType}`
		);
	}

	const nodeOutputs = new Map<string, Record<string, CpuValue>>();
	for (const nodeId of topologicalSort(doc, output.node)) {
		const node = doc.nodes.find((candidate) => candidate.id === nodeId);
		if (!node) {
			throw new Error(`Unknown node: ${nodeId}`);
		}
		nodeOutputs.set(nodeId, evaluateNode(doc, node, nodeOutputs, sample, options));
	}

	const result = nodeOutputs.get(output.node)?.[output.port];
	if (result === undefined) {
		throw new Error(`Missing output value: ${output.node}.${output.port}`);
	}
	if (!Array.isArray(result) || result.length !== 3) {
		throw new Error(
			`evaluateGraphVec3Output requires vec3f output; got ${Array.isArray(result) ? `array[${result.length}]` : typeof result}`
		);
	}
	return result.map((component) => Number(component));
}
