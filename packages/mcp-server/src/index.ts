// @world-lab/mcp-server — MCP server exposing the Typed Graph IR to AI assistants (documents, sessions, compile, diagnostics).
//
// M0 scaffold (see _docs/architecture/procedural-graph/implementation-plan.md).
// Depends only on graph + schema + compiler; no Svelte/renderer dependency.

import {
	describePortType,
	getPrimitive,
	listPrimitives as listRegisteredPrimitives,
	validateGraph,
	type GraphDocument,
	type ValidationIssue
} from '@world-lab/graph';

/** Package identity marker. */
export const MCP_SERVER_PACKAGE = '@world-lab/mcp-server' as const;

export interface PrimitiveInfo {
	id: string;
	category: string;
	inputs: string[];
	outputs: string[];
}

export interface ValidationResult {
	valid: boolean;
	errors: string[];
}

export interface PortInfo {
	id: string;
	name: string;
	dataType: string;
}

export interface NodeDescription {
	id: string;
	category: string;
	params: Record<string, unknown>;
	inputs: PortInfo[];
	outputs: PortInfo[];
	wgslEntry: string;
}

function formatValidationIssue(issue: ValidationIssue): string {
	switch (issue.kind) {
		case 'unknown-node':
			return `unknown-node: edge ${issue.edge}, node ${issue.node}`;
		case 'unknown-port':
			return `unknown-port: edge ${issue.edge}, node ${issue.node}, port ${issue.port}`;
		case 'bad-direction':
			return `bad-direction: edge ${issue.edge}, end ${issue.end}`;
		case 'type-mismatch':
			return `type-mismatch: edge ${issue.edge}, ${issue.from} -> ${issue.to}`;
		case 'space-mismatch':
			return `space-mismatch: edge ${issue.edge}, ${issue.from} -> ${issue.to}`;
		case 'unresolved-primitive':
			return `unresolved-primitive: node ${issue.node}, primitive ${issue.primitive}`;
		case 'unconnected-input':
			return `unconnected-input: node ${issue.node}, port ${issue.port}`;
		case 'no-output-path':
			return `no-output-path: output ${issue.output}, ${issue.node}.${issue.port}`;
		case 'dangling-node':
			return `dangling-node: node ${issue.node}`;
		case 'multiple-inputs':
			return `multiple-inputs: node ${issue.node}, port ${issue.port}, count ${issue.count}`;
		case 'duplicate-id':
			return `duplicate-id: ${issue.entity} ${issue.id}`;
		default:
			return JSON.stringify(issue);
	}
}

function paramKeysFromSchema(schema: { properties?: Record<string, unknown> }): string[] {
	return schema.properties ? Object.keys(schema.properties) : [];
}

export function listPrimitives(): PrimitiveInfo[] {
	return listRegisteredPrimitives().map((primitive) => ({
		id: primitive.id,
		category: primitive.category,
		inputs: primitive.inputs.map((port) => port.name),
		outputs: primitive.outputs.map((port) => port.name)
	}));
}

export function validateGraphDocument(doc: GraphDocument): ValidationResult {
	const result = validateGraph(doc);
	return {
		valid: result.ok,
		errors: result.issues.map(formatValidationIssue)
	};
}

export function describeNode(primitiveId: string): NodeDescription | null {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) return null;

	const paramKeys = paramKeysFromSchema(primitive.params as { properties?: Record<string, unknown> });
	const params = Object.fromEntries(paramKeys.map((key) => [key, null]));

	return {
		id: primitive.id,
		category: primitive.category,
		params,
		inputs: primitive.inputs.map((port) => ({
			id: port.name,
			name: port.name,
			dataType: describePortType(port)
		})),
		outputs: primitive.outputs.map((port) => ({
			id: port.name,
			name: port.name,
			dataType: describePortType(port)
		})),
		wgslEntry: primitive.wgsl.entry
	};
}
