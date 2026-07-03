import { loadWgslPrimitive, type LoadedWgslPrimitive } from '@world-lab/compiler';
import {
	getPrimitive,
	replacePrimitive,
	validateGraph,
	type GraphDocument,
	type Node,
	type NodePrimitive,
	type ValidationIssue
} from '@world-lab/graph';
import { Value, type TSchema } from '@world-lab/schema';
import { resyncGraphPortMetadata } from './graphSync.js';
import { instantiateNodeInputs, instantiateNodeOutputs } from './nodePortUtils.js';
import { isBuiltinPrimitive } from './primitiveSources.js';
import { registerUserPrimitiveFromSource } from './userPrimitives.js';

export interface PrimitiveSaveResult {
	loaded: LoadedWgslPrimitive;
	graph: GraphDocument;
	validationIssues: ValidationIssue[];
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
		inputs: instantiateNodeInputs(primitive),
		outputs: instantiateNodeOutputs(primitive),
		...(keys.length > 0 ? { params: merged } : {})
	};
}

function rippleGraph(graph: GraphDocument, primitiveId: string, primitive: NodePrimitive): GraphDocument {
	const synced = resyncGraphPortMetadata(graph);
	return {
		...synced,
		nodes: synced.nodes.map((node) =>
			node.primitive === primitiveId ? rippleNode(node, primitive) : node
		)
	};
}

export function applyPrimitiveSource(
	graph: GraphDocument,
	moduleId: string,
	source: string
): PrimitiveSaveResult {
	if (isBuiltinPrimitive(moduleId)) {
		throw new Error('Built-in primitives are read-only; clone to create an editable copy.');
	}

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

export { registerUserPrimitiveFromSource };
