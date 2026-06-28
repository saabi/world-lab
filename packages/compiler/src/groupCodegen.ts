import {
	getPrimitive,
	type DataType,
	type GraphDocument,
	type Node,
	type PortRef,
	type GroupDefinition,
	type CoordinateSpace
} from '@virtual-planet/graph';

// Helper to sanitize identifiers for WGSL
function sanitizeId(id: string): string {
	return id.replace(/[^a-zA-Z0-9_]/g, '_');
}

function portVar(nodeId: string, portId: string): string {
	return `v_${sanitizeId(nodeId)}_${sanitizeId(portId)}`;
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
	if (def.interface.outputs.length !== 1) {
		throw new Error(`Group definition must have exactly one output, got ${def.interface.outputs.length}`);
	}
	const groupOutputMapping = def.interface.outputs[0]!;
	const outputNodeId = groupOutputMapping.target.node;
	const outputPortId = groupOutputMapping.target.port;

	// 1. Sort nodes topologically from the output node
	const nodeIds = topologicalSort(subgraph, outputNodeId);

	// 2. Map group input ports to targets for quick lookup
	const inputMappings = new Map<string, string>(); // 'nodeId_portId' -> group input name
	for (const mapping of def.interface.inputs) {
		inputMappings.set(`${mapping.target.node}_${mapping.target.port}`, mapping.name);
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

		dependencies.add(primitive.wgsl.moduleId);

		// Resolve input arguments for the node's function call
		const argValues: string[] = [];
		const bindings = primitive.wgsl.arguments ?? [];

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

				const isList = inputPort.dataType.startsWith('list<') && inputPort.dataType.endsWith('>');

				if (isList) {
					const edges = subgraph.edges.filter(
						(e) => e.to.node === node.id && e.to.port === inputPort.id
					);

					const innerType = inputPort.dataType.slice(5, -1) as DataType;
					const wgslType = wgslTypeFor(innerType);

					if (edges.length === 1) {
						// Check if the upstream output dataType is 'storageBuffer'
						const edge = edges[0]!;
						const upstreamNode = subgraph.nodes.find((n) => n.id === edge.from.node);
						if (!upstreamNode) throw new Error(`Unknown upstream node: ${edge.from.node}`);
						const upstreamPort = [...upstreamNode.inputs, ...upstreamNode.outputs].find(
							(p) => p.id === edge.from.port
						);
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
						const upstreamNode = subgraph.nodes.find((n) => n.id === edge.from.node);
						if (!upstreamNode) throw new Error(`Unknown upstream node: ${edge.from.node}`);
						const upstreamPort = [...upstreamNode.inputs, ...upstreamNode.outputs].find(
							(p) => p.id === edge.from.port
						);
						if (!upstreamPort) throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);

						const expr = portVar(edge.from.node, edge.from.port);
						argExprs.push(promoteExpr(expr, upstreamPort.dataType, innerType));
					}

					if (argExprs.length > 0) {
						argValues.push(`array<${wgslType}, ${argExprs.length}>(${argExprs.join(', ')})`);
					} else {
						// Map to group input
						const groupInputName = inputMappings.get(`${node.id}_${inputPort.id}`);
						if (!groupInputName) {
							throw new Error(`Unconnected port ${node.id}.${inputPort.id} is not mapped to any group input`);
						}
						argValues.push(groupInputName);
					}
				} else {
					// Non-list input
					const edge = subgraph.edges.find(
						(e) => e.to.node === node.id && e.to.port === inputPort.id
					);

					if (edge) {
						// Connected upstream
						const upstreamNode = subgraph.nodes.find((n) => n.id === edge.from.node);
						if (!upstreamNode) throw new Error(`Unknown upstream node: ${edge.from.node}`);
						const upstreamPort = [...upstreamNode.inputs, ...upstreamNode.outputs].find(
							(p) => p.id === edge.from.port
						);
						if (!upstreamPort) throw new Error(`Unknown upstream port: ${edge.from.node}.${edge.from.port}`);

						const expr = portVar(edge.from.node, edge.from.port);
						argValues.push(promoteExpr(expr, upstreamPort.dataType, inputPort.dataType));
					} else {
						// Unconnected input: must map to a group input
						const groupInputName = inputMappings.get(`${node.id}_${inputPort.id}`);
						if (!groupInputName) {
							throw new Error(`Unconnected port ${node.id}.${inputPort.id} is not mapped to any group input`);
						}
						argValues.push(groupInputName);
					}
				}
			}
		}

		if (hasLoop) {
			for (const outPort of node.outputs) {
				const lhsVar = portVar(node.id, outPort.id);
				const lhsType = wgslTypeFor(outPort.dataType);
				bodyLines.push(`var ${lhsVar}: ${lhsType} = ${lhsType === 'f32' ? '0.0' : `${lhsType}()`};`);
				bodyLines.push(`let ${loopCountName} = arrayLength(&${loopVarName});`);
				bodyLines.push(`for (var ${loopIndexName}: u32 = 0u; ${loopIndexName} < ${loopCountName}; ${loopIndexName} = ${loopIndexName} + 1u) {`);
				bodyLines.push(`\t${lhsVar} = ${lhsVar} + ${loopCallExpr};`);
				bodyLines.push(`}`);
			}
		} else {
			for (const outPort of node.outputs) {
				const callExpr = `${primitive.wgsl.entry}(${argValues.join(', ')})`;
				const lhsType = wgslTypeFor(outPort.dataType);
				bodyLines.push(`let ${portVar(node.id, outPort.id)}: ${lhsType} = ${callExpr};`);
			}
		}
	}

	// 5. Generate @use directives
	const useDirectives = [...dependencies].map((dep) => `// @use ${dep}`).join('\n');

	// 6. Generate function header & body
	const entryFnName = def.id.split('.').pop() ?? 'group';
	const argsStr = def.interface.inputs
		.map((i) => `${i.name}: ${wgslTypeFor(i.dataType)}`)
		.join(', ');
	
	const returnTypeStr = wgslTypeFor(groupOutputMapping.dataType);

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
			return `  ${i.name}:${spaceStr || ' {}'}`;
		})
		.join('\n');

	const yamlOutputs = def.interface.outputs
		.map((o) => {
			const spaceStr = o.space && o.space !== 'none' ? `\n    space: ${o.space}` : '';
			return `  ${o.name}:${spaceStr || ' {}'}`;
		})
		.join('\n');

	const yamlRole = def.role ? `\nrole: ${def.role}` : '';
	const yamlHelp = def.help ? `\nhelp: "${def.help.replace(/"/g, '\\"')}"` : '';
	const yamlUsage = def.usage ? `\nusage: "${def.usage.replace(/"/g, '\\"')}"` : '';

	const frontmatter = `/*---
id: ${def.id}
category: ${def.category}
inputs:
${yamlInputs}
outputs:
${yamlOutputs}${yamlRole}${yamlHelp}${yamlUsage}
---*/`;

	return { wgsl, frontmatter };
}
