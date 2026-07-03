import {
	getPrimitive,
	compatiblePortTypes,
	describePortType,
	resolvePortDataType,
	type DataType,
	type GraphDocument,
	type Node,
	type Port,
	type PortRef,
	type SpaceId,
	type ValidationIssue,
	type ValidationResult
} from '@world-lab/graph';
import { Value, type TSchema } from '@world-lab/schema';
import { collectEdgeIds, collectNodeIds, mintEdgeId, mintNodeId } from './graphIds.js';
import { inputHandleId, outputHandleId } from './portHandles.js';
import { instantiateNodeInputs, instantiateNodeOutputs } from './nodePortUtils.js';

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
	| { kind: 'set-name'; nodeId: string; name: string }
	| { kind: 'replace-node-primitive'; nodeId: string; primitiveId: string }
	| {
			kind: 'add-connected-node';
			primitiveId: string;
			position: { x: number; y: number };
			source: PortRef;
			sourceDirection: 'in' | 'out';
	  };

function findInputPort(node: Node, portId: string): Port | undefined {
	return node.inputs.find((port) => port.id === portId);
}

function findOutputPort(node: Node, portId: string): Port | undefined {
	return node.outputs.find((port) => port.id === portId);
}

function syncNodePortLists(node: Node, primitiveId: string): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}
	return {
		...node,
		inputs: instantiateNodeInputs(primitive),
		outputs: instantiateNodeOutputs(primitive)
	};
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

	return syncNodePortLists(
		{
			...rest,
			primitive: primitiveId,
			...(keys.length > 0 ? { params: merged } : {})
		},
		primitiveId
	);
}

function pruneOutputsAndCompatibilitySinks(
	doc: GraphDocument,
	nodeId: string,
	validOutputPorts: ReadonlySet<string>
): Pick<GraphDocument, 'nodes' | 'outputs'> {
	const removedOutputNames = doc.outputs
		.filter((output) => output.from.node === nodeId && !validOutputPorts.has(output.from.port))
		.map((output) => output.name);
	const outputs = doc.outputs.filter(
		(output) => output.from.node !== nodeId || validOutputPorts.has(output.from.port)
	);
	if (removedOutputNames.length === 0) return { nodes: doc.nodes, outputs };

	const removed = new Set(removedOutputNames);
	const nodes = doc.nodes.flatMap((node) => {
		if (
			node.primitive === 'preview.fieldSink' &&
			typeof node.params?.outputName === 'string' &&
			removed.has(node.params.outputName)
		) {
			return [];
		}
		if (node.primitive !== 'legacy.consumerSink' || !Array.isArray(node.params?.outputs)) {
			return [node];
		}
		const sinkOutputs = node.params.outputs.filter(
			(output): output is string => typeof output === 'string' && !removed.has(output)
		);
		return sinkOutputs.length > 0
			? [{ ...node, params: { ...node.params, outputs: sinkOutputs } }]
			: [];
	});
	return { nodes, outputs };
}

function createNode(doc: GraphDocument, primitiveId: string, position: { x: number; y: number }): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) {
		throw new Error(`Unknown primitive: ${primitiveId}`);
	}

	const usedIds = collectNodeIds(doc);
	return syncNodePortLists(
		{
			id: mintNodeId(usedIds, primitiveId),
			primitive: primitiveId,
			position,
			inputs: [],
			outputs: []
		},
		primitiveId
	);
}

/** Canvas/inspector label for a node — custom name or primitive id. */
export function nodeDisplayLabel(node: Pick<Node, 'name' | 'primitive'>): string {
	const trimmed = node.name?.trim();
	return trimmed || node.primitive;
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
			label: nodeDisplayLabel(node),
			inputs: node.inputs,
			outputs: node.outputs
		}
	}));

	const edges = doc.edges.map((edge) => ({
		id: edge.id,
		source: edge.from.node,
		target: edge.to.node,
		sourceHandle: outputHandleId(edge.from.port),
		targetHandle: inputHandleId(edge.to.port),
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

	const fromPort = findOutputPort(fromNode, from.port);
	const toPort = findInputPort(toNode, to.port);

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

	if (!compatiblePortTypes(fromPort, toPort)) {
		issues.push({
			kind: 'type-mismatch',
			edge: edgeId,
			from: describePortType(fromPort),
			to: describePortType(toPort)
		});
	}

	const fromSpace: SpaceId = fromPort.space ?? 'none';
	const toSpace: SpaceId = toPort.space ?? 'none';
	if (fromSpace !== 'none' && toSpace !== 'none' && fromSpace !== toSpace) {
		issues.push({ kind: 'space-mismatch', edge: edgeId, from: fromSpace, to: toSpace });
	}

	return { ok: issues.length === 0, issues };
}

export function applyEditIntent(doc: GraphDocument, intent: GraphEditIntent): GraphDocument {
	switch (intent.kind) {
		case 'add-node': {
			const node = createNode(doc, intent.primitiveId, intent.position);
			return { ...doc, nodes: [...doc.nodes, node] };
		}
		case 'remove-node': {
			const { nodes, outputs } = pruneOutputsAndCompatibilitySinks(
				doc,
				intent.nodeId,
				new Set()
			);
			const retainedNodeIds = new Set(
				nodes.filter((node) => node.id !== intent.nodeId).map((node) => node.id)
			);
			return {
				...doc,
				nodes: nodes.filter((node) => node.id !== intent.nodeId),
				edges: doc.edges.filter(
					(edge) =>
						retainedNodeIds.has(edge.from.node) &&
						retainedNodeIds.has(edge.to.node)
				),
				outputs
			};
		}
		case 'duplicate-node': {
			const source = doc.nodes.find((node) => node.id === intent.sourceNodeId);
			if (!source) {
				throw new Error(`Unknown node: ${intent.sourceNodeId}`);
			}
			const newNode = {
				...createNode(doc, source.primitive, intent.position),
				...(source.params !== undefined ? { params: { ...source.params } } : {})
			};
			const nextDoc: GraphDocument = { ...doc, nodes: [...doc.nodes, newNode] };
			const usedEdgeIds = collectEdgeIds(nextDoc);
			const duplicatedEdges = doc.edges
				.filter((edge) => edge.from.node === source.id || edge.to.node === source.id)
				.map((edge) => {
					const id = mintEdgeId(usedEdgeIds);
					usedEdgeIds.add(id);
					return {
						id,
						from:
							edge.from.node === source.id
								? { ...edge.from, node: newNode.id }
								: edge.from,
						to:
							edge.to.node === source.id ? { ...edge.to, node: newNode.id } : edge.to
					};
				});
			return {
				...nextDoc,
				edges: [...doc.edges, ...duplicatedEdges]
			};
		}
		case 'add-edge': {
			const validation = validateConnection(doc, intent.from, intent.to);
			if (!validation.ok) {
				throw new Error(
					`Invalid connection: ${validation.issues.map((issue) => issue.kind).join(', ')}`
				);
			}
			const toNode = doc.nodes.find((node) => node.id === intent.to.node);
			const toPort = toNode?.inputs.find((port) => port.id === intent.to.port);
			const edges =
				toPort && !resolvePortDataType(toPort)?.startsWith('tuple<')
					? doc.edges.filter(
							(edge) =>
								!(edge.to.node === intent.to.node && edge.to.port === intent.to.port)
						)
					: doc.edges;
			return {
				...doc,
				edges: [
					...edges,
					{
						id: mintEdgeId(new Set(edges.map((edge) => edge.id))),
						from: intent.from,
						to: intent.to
					}
				]
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
		case 'set-name': {
			return {
				...doc,
				nodes: doc.nodes.map((node) => {
					if (node.id !== intent.nodeId) {
						return node;
					}
					const trimmed = intent.name.trim();
					if (!trimmed) {
						const { name: _removed, ...rest } = node;
						return rest;
					}
					return { ...node, name: trimmed };
				})
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
			const { nodes: prunedNodes, outputs } = pruneOutputsAndCompatibilitySinks(
				nextDoc,
				intent.nodeId,
				validOutputPorts
			);
			const retainedNodeIds = new Set(prunedNodes.map((node) => node.id));
			return {
				...nextDoc,
				nodes: prunedNodes,
				edges: edges.filter(
					(edge) => retainedNodeIds.has(edge.from.node) && retainedNodeIds.has(edge.to.node)
				),
				outputs
			};
		}
		case 'add-connected-node': {
			const sourceNode = doc.nodes.find((node) => node.id === intent.source.node);
			if (!sourceNode) {
				throw new Error(`Unknown node: ${intent.source.node}`);
			}

			const node = createNode(doc, intent.primitiveId, intent.position);
			const nextDoc: GraphDocument = { ...doc, nodes: [...doc.nodes, node] };

			let from: PortRef;
			let to: PortRef;

			if (intent.sourceDirection === 'out') {
				const sourcePort = findOutputPort(sourceNode, intent.source.port);
				if (!sourcePort) {
					throw new Error(`Unknown port: ${intent.source.port} on ${intent.source.node}`);
				}
				const targetPort = node.inputs.find((port) =>
					compatiblePortTypes(sourcePort, port)
				);
				if (!targetPort) {
					throw new Error(
						`No compatible input on ${intent.primitiveId} for ${describePortType(sourcePort)}`
					);
				}
				from = intent.source;
				to = { node: node.id, port: targetPort.id };
			} else {
				const sourcePort = findInputPort(sourceNode, intent.source.port);
				if (!sourcePort) {
					throw new Error(`Unknown port: ${intent.source.port} on ${intent.source.node}`);
				}
				const targetPort = node.outputs.find((port) =>
					compatiblePortTypes(port, sourcePort)
				);
				if (!targetPort) {
					throw new Error(
						`No compatible output on ${intent.primitiveId} for ${describePortType(sourcePort)}`
					);
				}
				from = { node: node.id, port: targetPort.id };
				to = intent.source;
			}

			const validation = validateConnection(nextDoc, from, to);
			if (!validation.ok) {
				throw new Error(
					`Invalid connection: ${validation.issues.map((issue) => issue.kind).join(', ')}`
				);
			}

			const toNode = nextDoc.nodes.find((candidate) => candidate.id === to.node);
			const toPort = toNode?.inputs.find((port) => port.id === to.port);
			const edges =
				toPort && !resolvePortDataType(toPort)?.startsWith('tuple<')
					? nextDoc.edges.filter(
							(edge) => !(edge.to.node === to.node && edge.to.port === to.port)
						)
					: nextDoc.edges;

			return {
				...nextDoc,
				edges: [
					...edges,
					{
						id: mintEdgeId(new Set(edges.map((edge) => edge.id))),
						from,
						to
					}
				]
			};
		}
		default: {
			const _exhaustive: never = intent;
			return _exhaustive;
		}
	}
}

/** @deprecated Doc-aware minting ignores counters; kept for test compatibility. */
export function resetIdCounters(_nextNode = 0, _nextEdge = 0): void {}
