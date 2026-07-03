import {
	getPrimitive,
	canonicalDataType,
	callableWgslSource,
	dataTypeToWgsl,
	dedupeCanonicalSemantics,
	formatPortDefaultWgsl,
	describePortType,
	resolveCoercion,
	resolveInputPortDefault,
	resolvePortDataType,
	resolvePortType,
	typeRefToWgsl,
	type PortTypeLike,
	type DataType,
	type GraphDocument,
	type GroupResolver,
	type Node,
	type PortRef,
	type GroupDefinition,
	type ValueDataType
} from '@world-lab/graph';
import {
	annotationsOf,
	fieldKind,
	fields,
	sectionsOf,
	type TSchema
} from '@world-lab/schema';
import { emitCoercion } from './coercion.js';

// Helper to sanitize identifiers for WGSL
function sanitizeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function portVar(nodeId: string, portId: string): string {
	return `v_${sanitizeId(nodeId)}_${sanitizeId(portId)}`;
}

function coerceExpr(expr: string, from: PortTypeLike, to: PortTypeLike): string {
	const plan = resolveCoercion(resolvePortType(from), resolvePortType(to));
	if (plan) return emitCoercion(plan, expr);
	throw new Error(`Type mismatch: ${describePortType(from)} -> ${describePortType(to)}`);
}

function groupParamWgslType(schema: TSchema): string {
	const kind = fieldKind(schema);
	if (kind === 'boolean') return 'bool';
	if (kind === 'number') return 'f32';
	if (kind === 'integer') {
		throw new Error(
			'Group param mappings do not support integer schemas (i32 graph ports are out of scope)'
		);
	}
	throw new Error(`Unsupported group param schema kind: ${kind}`);
}

function groupParamDataType(schema: TSchema): ValueDataType {
	const kind = fieldKind(schema);
	if (kind === 'boolean') return 'bool';
	if (kind === 'number') return 'f32';
	if (kind === 'integer') {
		throw new Error(
			'Group param mappings do not support integer schemas (i32 graph ports are out of scope)'
		);
	}
	throw new Error(`Unsupported group param schema kind: ${kind}`);
}

function assertParamPortCompatible(paramType: ValueDataType, port: PortTypeLike): void {
	const portType = resolvePortDataType(port);
	if (portType && canonicalDataType(paramType) === canonicalDataType(portType)) return;
	throw new Error(
		`Incompatible group param type ${paramType} for input port data type ${describePortType(port)}`
	);
}

function validateGroupParamContract(def: GroupDefinition): void {
	const mappings = def.interface.params ?? [];
	const paramsSchema = def.params;

	if (mappings.length === 0) {
		if (paramsSchema && fields(paramsSchema).length > 0) {
			throw new Error('GroupDefinition.params has properties not mapped in interface.params');
		}
		return;
	}

	if (!paramsSchema) {
		throw new Error('GroupDefinition.params is required when interface.params is set');
	}

	const schemaFields = new Map(fields(paramsSchema).map((field) => [field.key, field.schema]));
	const mappedNames = new Set(mappings.map((mapping) => mapping.name));

	for (const name of schemaFields.keys()) {
		if (!mappedNames.has(name)) {
			throw new Error(`Group param schema property "${name}" is not mapped in interface.params`);
		}
	}

	for (const mapping of mappings) {
		const schema = schemaFields.get(mapping.name);
		if (!schema) {
			throw new Error(`Group param mapping references unknown schema property: ${mapping.name}`);
		}

		const paramType = groupParamDataType(schema);
		const node = def.subgraph.nodes.find((candidate) => candidate.id === mapping.target.node);
		if (!node) {
			throw new Error(`Unknown group param target node: ${mapping.target.node}`);
		}
		const port = node.inputs.find(
			(candidate) => candidate.id === mapping.target.port || candidate.name === mapping.target.port
		);
		if (!port) {
			throw new Error(
				`Unknown group param target port: ${mapping.target.node}.${mapping.target.port}`
			);
		}
		assertParamPortCompatible(paramType, port);
	}
}

function formatParamValue(val: unknown, type?: string): string {
	if (typeof val === 'boolean') {
		return `${val}`;
	}
	if (typeof val === 'number') {
		if (type === 'integer') {
			return `${Math.floor(val)}`;
		}
		// If float, ensure decimal point or scientific notation
		const s = val.toString();
		return s.includes('.') || s.includes('e') ? s : `${s}.0`;
	}
	return `${val}`;
}

function serializeParamYaml(name: string, schema: TSchema): string {
	const lines: string[] = [`  ${name}:`];
	const annotations = annotationsOf(schema);
	const kind = fieldKind(schema);
	if (annotations.description) {
		lines.push(`    description: ${JSON.stringify(annotations.description)}`);
	}
	if (annotations.unit) {
		lines.push(`    unit: ${annotations.unit}`);
	}
	if (annotations.widget) {
		lines.push(`    widget: ${annotations.widget}`);
	}
	if (annotations.section) {
		lines.push(`    section: ${annotations.section}`);
	}
	if (annotations.scaleBehavior) {
		lines.push(`    scaleBehavior: ${annotations.scaleBehavior}`);
	}
	if (annotations.extent) {
		const [min, max] = annotations.extent;
		if (min !== null) lines.push(`    min: ${formatParamValue(min)}`);
		if (max !== null) lines.push(`    max: ${formatParamValue(max)}`);
	}
	if (!('default' in (schema as Record<string, unknown>))) {
		throw new Error(`Missing default for param ${name}`);
	}
	lines.push(`    default: ${formatParamValue(annotations.default, kind === 'integer' ? 'integer' : undefined)}`);
	return lines.join('\n');
}

function serializeParamsFrontmatter(paramsSchema: TSchema, paramNames: readonly string[]): string {
	const paramFields = new Map(fields(paramsSchema).map((field) => [field.key, field.schema]));
	for (const name of paramNames) {
		if (!paramFields.has(name)) {
			throw new Error(`Group param mapping references unknown schema property: ${name}`);
		}
	}
	const yamlParams = paramNames.map((name) => serializeParamYaml(name, paramFields.get(name)!)).join('\n');
	const sectionList = sectionsOf(paramsSchema);
	const yamlSections =
		sectionList.length > 0
			? `\nsections:\n${sectionList
					.map((section) => {
						const parts = [`  - id: ${section.id}`];
						if (section.label) parts.push(`    label: ${JSON.stringify(section.label)}`);
						if (section.order !== undefined) parts.push(`    order: ${section.order}`);
						if (section.collapsed !== undefined) parts.push(`    collapsed: ${section.collapsed}`);
						if (section.parent) parts.push(`    parent: ${section.parent}`);
						return parts.join('\n');
					})
					.join('\n')}`
			: '';
	return `${yamlSections}${yamlSections ? '\n' : ''}params:\n${yamlParams}`;
}

// Topological sort from outputNodeId
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

/**
 * Generate a WGSL function and its YAML frontmatter description for a node group.
 */
export function groupToFunction(def: GroupDefinition): { wgsl: string; frontmatter: string } {
	const subgraph = def.subgraph;
	validateGroupParamContract(def);
	if (def.interface.outputs.length !== 1) {
		throw new Error(`Group definition must have exactly one output, got ${def.interface.outputs.length}`);
	}
	const groupOutputMapping = def.interface.outputs[0]!;
	const outputNodeId = groupOutputMapping.target.node;
	const outputPortId = groupOutputMapping.target.port;

	// 1. Sort nodes topologically from the output node
	const nodeIds = topologicalSort(subgraph, outputNodeId);

	// 2. Map group input/param ports to targets for quick lookup
	const inputMappings = new Map<string, string>(); // 'nodeId_portId' -> group input name
	for (const mapping of def.interface.inputs) {
		inputMappings.set(`${mapping.target.node}_${mapping.target.port}`, mapping.name);
	}
	const paramMappings = new Map<string, string>(); // 'nodeId_portId' -> group param name
	const mappedParamNames = new Set<string>();
	for (const mapping of def.interface.params ?? []) {
		paramMappings.set(`${mapping.target.node}_${mapping.target.port}`, mapping.name);
		mappedParamNames.add(mapping.name);
	}
	let interfaceParamOrder: string[] = [];
	if (mappedParamNames.size > 0) {
		if (!def.params) {
			throw new Error('GroupDefinition.params is required when interface.params is set');
		}
		interfaceParamOrder = fields(def.params)
			.map((field) => field.key)
			.filter((name) => mappedParamNames.has(name));
		for (const name of mappedParamNames) {
			if (!interfaceParamOrder.includes(name)) {
				throw new Error(`Group param mapping references unknown schema property: ${name}`);
			}
		}
	}

	// 3. Keep track of referenced modules (dependencies)
	const dependencies = new Set<string>();

	// 4. Generate evaluation body lines
	const bodyLines: string[] = [];

	for (const nodeId of nodeIds) {
		const node = subgraph.nodes.find((n) => n.id === nodeId);
		if (!node) throw new Error(`Unknown node in subgraph: ${nodeId}`);

		const primitive = getPrimitive(node.primitive);
		if (!primitive) throw new Error(`Unknown primitive: ${node.primitive}`);
		const wgsl = callableWgslSource(primitive);
		if (!wgsl) {
			throw new Error(
				`Group node ${node.id} requires a callable primitive; got ${primitive.implementation.kind}`
			);
		}

		dependencies.add(wgsl.moduleId);

		// Resolve input arguments for the node's function call
		const argValues: string[] = [];
		const bindings = wgsl.arguments ?? [];

		// If arguments metadata isn't explicitly defined, infer it
		const actualBindings = bindings.length > 0 ? bindings : [
			...node.inputs.map(i => ({ name: i.name, source: 'input' as const })),
			...Object.keys(node.params ?? {}).map(k => ({ name: k, source: 'param' as const }))
		];

		let hasLoop = false;
		let loopVarName = '';
		let loopCountName = '';
		let loopIndexName = '';
		let loopCallExpr = '';

		for (const binding of actualBindings) {
			if (binding.source === 'param') {
				// Param value is fixed in the group, inline it
				const val = (node.params ?? {})[binding.name];
				const paramSchema = primitive.params.properties?.[binding.name];
				argValues.push(formatParamValue(val, paramSchema?.type));
			} else {
				// Input: either connected to an upstream output or a group input argument
				const inputPort = node.inputs.find((i) => i.name === binding.name || i.id === binding.name);
				if (!inputPort) throw new Error(`Missing input port ${binding.name} on node ${node.id}`);

				const inputDataType = resolvePortDataType(inputPort);
				const isTuple =
					inputDataType !== undefined &&
					inputDataType.startsWith('tuple<') &&
					inputDataType.endsWith('>');

				if (isTuple) {
					const edges = subgraph.edges.filter(
						(e) => e.to.node === node.id && e.to.port === inputPort.id
					);

					const innerType = inputDataType.slice(6, -1) as DataType;
					const wgslType = dataTypeToWgsl(innerType);

					if (edges.length === 1) {
						// Check if the upstream output dataType is 'storageBuffer'
						const edge = edges[0]!;
						const upstreamNode = subgraph.nodes.find((n) => n.id === edge.from.node);
						if (!upstreamNode) throw new Error(`Unknown upstream node: ${edge.from.node}`);
						const upstreamPort = upstreamNode.outputs.find((p) => p.id === edge.from.port);
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
						const upstreamNode = subgraph.nodes.find((n) => n.id === edge.from.node);
						if (!upstreamNode) throw new Error(`Unknown upstream node: ${edge.from.node}`);
						const upstreamPort = upstreamNode.outputs.find((p) => p.id === edge.from.port);
						if (!upstreamPort) throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);

						const expr = portVar(edge.from.node, edge.from.port);
						argExprs.push(coerceExpr(expr, upstreamPort, { dataType: innerType }));
					}

					if (argExprs.length > 0) {
						argValues.push(`array<${wgslType}, ${argExprs.length}>(${argExprs.join(', ')})`);
					} else {
						// Map to group input or param
						const groupParamName = paramMappings.get(`${node.id}_${inputPort.id}`);
						if (groupParamName) {
							argValues.push(groupParamName);
						} else {
							const groupInputName = inputMappings.get(`${node.id}_${inputPort.id}`);
							if (!groupInputName) {
								throw new Error(`Unconnected port ${node.id}.${inputPort.id} is not mapped to any group input or param`);
							}
							argValues.push(groupInputName);
						}
					}
				} else {
					// Non-tuple input
					const edge = subgraph.edges.find(
						(e) => e.to.node === node.id && e.to.port === inputPort.id
					);

					if (edge) {
						// Connected upstream
						const upstreamNode = subgraph.nodes.find((n) => n.id === edge.from.node);
						if (!upstreamNode) throw new Error(`Unknown upstream node: ${edge.from.node}`);
						const upstreamPort = upstreamNode.outputs.find((p) => p.id === edge.from.port);
						if (!upstreamPort) throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);

						const expr = portVar(edge.from.node, edge.from.port);
						argValues.push(coerceExpr(expr, upstreamPort, inputPort));
					} else {
						const portDefault = resolveInputPortDefault(node, inputPort, primitive);
						if (portDefault !== undefined) {
							if (!inputDataType) {
								throw new Error(`Port defaults require a legacy data type: ${inputPort.name}`);
							}
							argValues.push(formatPortDefaultWgsl(portDefault, inputDataType));
						} else {
							const groupParamName = paramMappings.get(`${node.id}_${inputPort.id}`);
							if (groupParamName) {
								argValues.push(groupParamName);
							} else {
								const groupInputName = inputMappings.get(`${node.id}_${inputPort.id}`);
								if (!groupInputName) {
									throw new Error(
										`Unconnected port ${node.id}.${inputPort.id} is not mapped to any group input or param`
									);
								}
								argValues.push(groupInputName);
							}
						}
					}
				}
			}
		}

		if (hasLoop) {
			for (const outPort of node.outputs) {
				const lhsVar = portVar(node.id, outPort.id);
				const lhsType = typeRefToWgsl(resolvePortType(outPort));
				bodyLines.push(`var ${lhsVar}: ${lhsType} = ${lhsType === 'f32' ? '0.0' : `${lhsType}()`};`);
				bodyLines.push(`let ${loopCountName} = arrayLength(&${loopVarName});`);
				bodyLines.push(`for (var ${loopIndexName}: u32 = 0u; ${loopIndexName} < ${loopCountName}; ${loopIndexName} = ${loopIndexName} + 1u) {`);
				bodyLines.push(`\t${lhsVar} = ${lhsVar} + ${loopCallExpr};`);
				bodyLines.push(`}`);
			}
		} else {
			for (const outPort of node.outputs) {
				const callExpr = `${wgsl.entry}(${argValues.join(', ')})`;
				const lhsType = typeRefToWgsl(resolvePortType(outPort));
				bodyLines.push(`let ${portVar(node.id, outPort.id)}: ${lhsType} = ${callExpr};`);
			}
		}
	}

	// 5. Generate @use directives
	const useDirectives = [...dependencies].map((dep) => `// @use ${dep}`).join('\n');

	// 6. Generate function header & body
	const entryFnName = def.id.split('.').pop() ?? 'group';
	const inputArgs = def.interface.inputs.map((i) => `${i.name}: ${dataTypeToWgsl(i.dataType)}`);
	const paramFieldSchemas = def.params
		? new Map(fields(def.params).map((field) => [field.key, field.schema]))
		: new Map<string, TSchema>();
	const paramArgs = interfaceParamOrder.map((name) => {
		const schema = paramFieldSchemas.get(name);
		if (!schema) {
			throw new Error(`Missing schema for group param: ${name}`);
		}
		return `${name}: ${groupParamWgslType(schema)}`;
	});
	const argsStr = [...inputArgs, ...paramArgs].join(', ');
	
	const returnTypeStr = dataTypeToWgsl(groupOutputMapping.dataType);

	const fnBody = bodyLines.map((line) => `\t${line}`).join('\n');
	const returnVal = portVar(outputNodeId, outputPortId);

	const wgsl = `${useDirectives}
fn ${entryFnName}(${argsStr}) -> ${returnTypeStr} {
${fnBody}
\treturn ${returnVal};
}`;

	// 7. Generate YAML frontmatter
	const yamlInputs = def.interface.inputs
		.map((i) => {
			const spaceStr = i.space && i.space !== 'none' ? `\n    space: ${i.space}` : '';
			const semanticsStr =
				i.semantics !== undefined
					? `\n    semantics: ${JSON.stringify(dedupeCanonicalSemantics(i.semantics))}`
					: '';
			const fields = `${spaceStr}${semanticsStr}`;
			return `  ${i.name}:${fields || ' {}'}`;
		})
		.join('\n');

	const yamlOutputs = def.interface.outputs
		.map((o) => {
			const spaceStr = o.space && o.space !== 'none' ? `\n    space: ${o.space}` : '';
			const semanticsStr =
				o.semantics !== undefined
					? `\n    semantics: ${JSON.stringify(dedupeCanonicalSemantics(o.semantics))}`
					: '';
			const fields = `${spaceStr}${semanticsStr}`;
			return `  ${o.name}:${fields || ' {}'}`;
		})
		.join('\n');

	const yamlRole = def.role ? `\nrole: ${def.role}` : '';
	const yamlHelp = def.help ? `\nhelp: "${def.help.replace(/"/g, '\\"')}"` : '';
	const yamlUsage = def.usage ? `\nusage: "${def.usage.replace(/"/g, '\\"')}"` : '';
	const yamlParams =
		interfaceParamOrder.length > 0 && def.params
			? `\n${serializeParamsFrontmatter(def.params, interfaceParamOrder)}`
			: '';

	const frontmatter = `/*---
id: ${def.id}
category: ${def.category}
inputs:
${yamlInputs}
outputs:
${yamlOutputs}${yamlParams}${yamlRole}${yamlHelp}${yamlUsage}
---*/`;

	return { wgsl, frontmatter };
}

export async function groupToFunctionById(
	groupId: string,
	resolver: GroupResolver
): Promise<{ wgsl: string; frontmatter: string }> {
	return groupToFunction(await resolver.resolve(groupId));
}
