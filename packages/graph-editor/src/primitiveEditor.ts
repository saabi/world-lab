import { loadWgslPrimitive, type LoadedWgslPrimitive } from '@virtual-planet/compiler';
import {
	getPrimitive,
	replacePrimitive,
	validateGraph,
	type GraphDocument,
	type Node,
	type NodePrimitive,
	type Port,
	type PortSpec,
	type ValidationIssue
} from '@virtual-planet/graph';
import { Value, type TSchema } from '@virtual-planet/schema';

export interface PrimitiveSaveResult {
	loaded: LoadedWgslPrimitive;
	graph: GraphDocument;
	validationIssues: ValidationIssue[];
}

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? 'none'
	}));
}

function paramKeys(schema: TSchema): string[] {
	const properties = (schema as { properties?: Record<string, unknown> }).properties;
	return properties ? Object.keys(properties) : [];
}

function rippleNode(node: Node, primitive: NodePrimitive): Node {
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

	return {
		...node,
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out'),
		...(keys.length > 0 ? { params: merged } : {})
	};
}

function rippleGraph(graph: GraphDocument, primitiveId: string, primitive: NodePrimitive): GraphDocument {
	return {
		...graph,
		nodes: graph.nodes.map((node) =>
			node.primitive === primitiveId ? rippleNode(node, primitive) : node
		)
	};
}

export function applyPrimitiveSource(
	graph: GraphDocument,
	moduleId: string,
	source: string
): PrimitiveSaveResult {
	const previous = getPrimitive(moduleId);
	if (!previous) {
		throw new Error(`Primitive not registered: ${moduleId}`);
	}

	const loaded = loadWgslPrimitive({ moduleId, source });
	if (loaded.primitive.id !== moduleId) {
		throw new Error(
			`Primitive id mismatch: expected ${moduleId}, got ${loaded.primitive.id}`
		);
	}

	const primitive: NodePrimitive = {
		...loaded.primitive,
		evalCPU: previous.evalCPU
	};

	replacePrimitive(primitive);

	const rippled = rippleGraph(graph, moduleId, primitive);
	const validation = validateGraph(rippled);

	return {
		loaded,
		graph: rippled,
		validationIssues: validation.issues
	};
}
