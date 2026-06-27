import {
	getPrimitive,
	validateGraph,
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

export interface FlowNodeData {
	nodeId: string;
	primitiveId: string;
	label: string;
}

export interface FlowEdgeData {
	edgeId: string;
	from: PortRef;
	to: PortRef;
}

export type GraphEditIntent =
	| { kind: 'add-node'; primitiveId: string; position: { x: number; y: number } }
	| { kind: 'remove-node'; nodeId: string }
	| { kind: 'add-edge'; from: PortRef; to: PortRef }
	| { kind: 'remove-edge'; edgeId: string }
	| { kind: 'move-node'; nodeId: string; position: { x: number; y: number } }
	| { kind: 'set-params'; nodeId: string; params: Record<string, unknown> };

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

function compatibleDataTypes(from: DataType, to: DataType): boolean {
	if (from === to) return true;
	if (from === 'vec2f' && to === 'vec3f') return true;
	return false;
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
			label: node.primitive
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
			return {
				...doc,
				nodes: doc.nodes.filter((node) => node.id !== intent.nodeId),
				edges: doc.edges.filter(
					(edge) => edge.from.node !== intent.nodeId && edge.to.node !== intent.nodeId
				)
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
