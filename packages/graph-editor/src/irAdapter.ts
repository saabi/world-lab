import {
	getPrimitive,
	compatibleDataTypes,
	type CoordinateSpace,
	type DataType,
	type GraphDocument,
	type Node,
	type Port,
	type PortRef,
	type PortSpec,
	type ValidationIssue,
	type ValidationResult
} from '@virtual-planet/graph';
import { Value, type TSchema } from '@virtual-planet/schema';

export interface FlowNodeData {
	nodeId: string;
	primitiveId: string;
	label: string;
	inputs: Port[];
	outputs: Port[];
	nodeIssue?: 'error' | 'warning';
	inputIssues?: Readonly<Record<string, 'error' | 'warning'>>;
}

export interface FlowEdgeData {
	edgeId: string;
	from: PortRef;
	to: PortRef;
}

export type GraphEditIntent =
	| { kind: 'add-node'; primitiveId: string; position: { x: number; y: number } }
	| { kind: 'remove-node'; nodeId: string }
	| { kind: 'duplicate-node'; sourceNodeId: string; position: { x: number; y: number } }
	| { kind: 'add-edge'; from: PortRef; to: PortRef }
	| { kind: 'remove-edge'; edgeId: string }
	| { kind: 'move-node'; nodeId: string; position: { x: number; y: number } }
	| { kind: 'set-params'; nodeId: string; params: Record<string, unknown> }
	| { kind: 'replace-node-primitive'; nodeId: string; primitiveId: string };

let nodeCounter = 0;
let edgeCounter = 0;

function nextNodeId(primitiveId: string): string {
	nodeCounter += 1;
	return `n_${primitiveId.replace(/\./g, '_')}_${nodeCounter}`;
}

function nextEdgeId(): string {
	edgeCounter += 1;
	return `e_${edgeCounter}`;
}

function findPort(node: Node, portId: string): Port | undefined {
	return [...node.inputs, ...node.outputs].find((port) => port.id === portId);
}

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		...(spec.space !== undefined ? { space: spec.space } : {})
	}));
}

function paramKeys(schema: TSchema): string[] {
	const properties = (schema as { properties?: Record<string, unknown> }).properties;
	return properties ? Object.keys(properties) : [];
}

function replaceNodePrimitive(node: Node, primitiveId: string): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}

	const defaults = Value.Create(primitive.params) as Record<string, unknown>;
	const merged: Record<string, unknown> = { ...defaults };
	if (node.params) {
		for (const key of paramKeys(primitive.params)) {
			if (key in node.params) {
				merged[key] = node.params[key];
			}
		}
	}
	const keys = paramKeys(primitive.params);
	const { params: _previousParams, ...rest } = node;

	return {
		...rest,
		primitive: primitiveId,
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out'),
		...(keys.length > 0 ? { params: merged } : {})
	};
}

function pruneOutputsAndConsumers(
	doc: GraphDocument,
	nodeId: string,
	validOutputPorts: ReadonlySet<string>
): Pick<GraphDocument, 'outputs' | 'consumers'> {
	const removedOutputNames = doc.outputs
		.filter((output) => output.from.node === nodeId && !validOutputPorts.has(output.from.port))
		.map((output) => output.name);
	const outputs = doc.outputs.filter(
		(output) => output.from.node !== nodeId || validOutputPorts.has(output.from.port)
	);
	const consumers =
		removedOutputNames.length === 0
			? doc.consumers
			: doc.consumers
					.map((consumer) => ({
						...consumer,
						outputs: consumer.outputs.filter((name) => !removedOutputNames.includes(name))
					}))
					.filter((consumer) => consumer.outputs.length > 0);
	return { outputs, consumers };
}

function createNode(primitiveId: string, position: { x: number; y: number }): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}

	return {
		id: nextNodeId(primitiveId),
		primitive: primitiveId,
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out'),
		position
	};
}

export function graphToFlow(doc: GraphDocument): {
	nodes: Array<{ id: string; position: { x: number; y: number }; data: FlowNodeData }>;
	edges: Array<{
		id: string;
		source: string;
		target: string;
		sourceHandle: string;
		targetHandle: string;
		data: FlowEdgeData;
	}>;
} {
	const nodes = doc.nodes.map((node) => ({
		id: node.id,
		position: node.position ?? { x: 0, y: 0 },
		data: {
			nodeId: node.id,
			primitiveId: node.primitive,
			label: node.primitive,
			inputs: node.inputs,
			outputs: node.outputs
		}
	}));

	const edges = doc.edges.map((edge) => ({
		id: edge.id,
		source: edge.from.node,
		target: edge.to.node,
		sourceHandle: edge.from.port,
		targetHandle: edge.to.port,
		data: {
			edgeId: edge.id,
			from: edge.from,
			to: edge.to
		}
	}));

	return { nodes, edges };
}

export function validateConnection(
	doc: GraphDocument,
	from: PortRef,
	to: PortRef
): ValidationResult {
	const issues: ValidationIssue[] = [];
	const edgeId = '__validate__';

	const fromNode = doc.nodes.find((node) => node.id === from.node);
	const toNode = doc.nodes.find((node) => node.id === to.node);

	if (!fromNode) {
		issues.push({ kind: 'unknown-node', edge: edgeId, node: from.node });
	}
	if (!toNode) {
		issues.push({ kind: 'unknown-node', edge: edgeId, node: to.node });
	}
	if (!fromNode || !toNode) {
		return { ok: false, issues };
	}

	const fromPort = findPort(fromNode, from.port);
	const toPort = findPort(toNode, to.port);

	if (!fromPort) {
		issues.push({ kind: 'unknown-port', edge: edgeId, node: from.node, port: from.port });
	}
	if (!toPort) {
		issues.push({ kind: 'unknown-port', edge: edgeId, node: to.node, port: to.port });
	}
	if (!fromPort || !toPort) {
		return { ok: false, issues };
	}

	if (fromPort.direction !== 'out') {
		issues.push({ kind: 'bad-direction', edge: edgeId, end: 'from' });
	}
	if (toPort.direction !== 'in') {
		issues.push({ kind: 'bad-direction', edge: edgeId, end: 'to' });
	}

	if (!compatibleDataTypes(fromPort.dataType, toPort.dataType)) {
		issues.push({
			kind: 'type-mismatch',
			edge: edgeId,
			from: fromPort.dataType,
			to: toPort.dataType
		});
	}

	const fromSpace: CoordinateSpace = fromPort.space ?? 'none';
	const toSpace: CoordinateSpace = toPort.space ?? 'none';
	if (fromSpace !== 'none' && toSpace !== 'none' && fromSpace !== toSpace) {
		issues.push({ kind: 'space-mismatch', edge: edgeId, from: fromSpace, to: toSpace });
	}

	return { ok: issues.length === 0, issues };
}

export function applyEditIntent(doc: GraphDocument, intent: GraphEditIntent): GraphDocument {
	switch (intent.kind) {
		case 'add-node': {
			const node = createNode(intent.primitiveId, intent.position);
			return { ...doc, nodes: [...doc.nodes, node] };
		}
		case 'remove-node': {
			const removedOutputNames = doc.outputs
				.filter((output) => output.from.node === intent.nodeId)
				.map((output) => output.name);
			const outputs = doc.outputs.filter((output) => output.from.node !== intent.nodeId);
			const consumers =
				removedOutputNames.length === 0
					? doc.consumers
					: doc.consumers
							.map((consumer) => ({
								...consumer,
								outputs: consumer.outputs.filter((name) => !removedOutputNames.includes(name))
							}))
							.filter((consumer) => consumer.outputs.length > 0);
			return {
				...doc,
				nodes: doc.nodes.filter((node) => node.id !== intent.nodeId),
				edges: doc.edges.filter(
					(edge) => edge.from.node !== intent.nodeId && edge.to.node !== intent.nodeId
				),
				outputs,
				consumers
			};
		}
		case 'duplicate-node': {
			const source = doc.nodes.find((node) => node.id === intent.sourceNodeId);
			if (!source) {
				throw new Error(`Unknown node: ${intent.sourceNodeId}`);
			}
			const node = createNode(source.primitive, intent.position);
			return {
				...doc,
				nodes: [
					...doc.nodes,
					{
						...node,
						...(source.params !== undefined ? { params: { ...source.params } } : {})
					}
				]
			};
		}
		case 'add-edge': {
			const validation = validateConnection(doc, intent.from, intent.to);
			if (!validation.ok) {
				throw new Error(
					`Invalid connection: ${validation.issues.map((issue) => issue.kind).join(', ')}`
				);
			}
			return {
				...doc,
				edges: [...doc.edges, { id: nextEdgeId(), from: intent.from, to: intent.to }]
			};
		}
		case 'remove-edge': {
			return {
				...doc,
				edges: doc.edges.filter((edge) => edge.id !== intent.edgeId)
			};
		}
		case 'move-node': {
			return {
				...doc,
				nodes: doc.nodes.map((node) =>
					node.id === intent.nodeId ? { ...node, position: intent.position } : node
				)
			};
		}
		case 'set-params': {
			return {
				...doc,
				nodes: doc.nodes.map((node) =>
					node.id === intent.nodeId ? { ...node, params: { ...intent.params } } : node
				)
			};
		}
		case 'replace-node-primitive': {
			const existing = doc.nodes.find((node) => node.id === intent.nodeId);
			if (!existing) {
				throw new Error(`Unknown node: ${intent.nodeId}`);
			}
			const position = existing.position ?? { x: 0, y: 0 };
			const replaced = replaceNodePrimitive({ ...existing, position }, intent.primitiveId);
			const nodes = doc.nodes.map((node) => (node.id === intent.nodeId ? replaced : node));
			const nextDoc: GraphDocument = { ...doc, nodes };
			const edges = doc.edges.filter((edge) => validateConnection(nextDoc, edge.from, edge.to).ok);
			const validOutputPorts = new Set(replaced.outputs.map((port) => port.id));
			const { outputs, consumers } = pruneOutputsAndConsumers(nextDoc, intent.nodeId, validOutputPorts);
			return { ...nextDoc, edges, outputs, consumers };
		}
		default: {
			const _exhaustive: never = intent;
			return _exhaustive;
		}
	}
}

/** Reset id counters — for deterministic tests. */
export function resetIdCounters(nextNode = 0, nextEdge = 0): void {
	nodeCounter = nextNode;
	edgeCounter = nextEdge;
}
