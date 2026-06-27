import type { GraphDocument, Node, PortRef } from '@virtual-planet/graph';

const INDENT = '  ';

function escapeAttr(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function portRef(ref: PortRef): string {
	return `${ref.node}.${ref.port}`;
}

function formatParamValue(value: unknown): string {
	if (typeof value === 'boolean') {
		return value ? 'true' : 'false';
	}
	if (typeof value === 'number') {
		return String(value);
	}
	if (typeof value === 'string') {
		return escapeAttr(value);
	}
	return escapeAttr(JSON.stringify(value));
}

function formatPositionAttr(value: number): string {
	return Number.isInteger(value) ? String(value) : String(value);
}

function printNode(node: Node, depth: number): string {
	const pad = INDENT.repeat(depth);
	const innerPad = INDENT.repeat(depth + 1);
	const attrs = [`id="${escapeAttr(node.id)}"`, `primitive="${escapeAttr(node.primitive)}"`];

	if (node.position) {
		attrs.push(`x="${formatPositionAttr(node.position.x)}"`, `y="${formatPositionAttr(node.position.y)}"`);
	}

	const paramEntries = node.params
		? Object.keys(node.params)
				.sort()
				.map((name) => [name, node.params![name]] as const)
		: [];

	if (paramEntries.length === 0) {
		return `${pad}<Node ${attrs.join(' ')} />`;
	}

	const lines = [`${pad}<Node ${attrs.join(' ')}>`];
	for (const [name, value] of paramEntries) {
		lines.push(
			`${innerPad}<Param name="${escapeAttr(name)}" value="${formatParamValue(value)}" />`
		);
	}
	lines.push(`${pad}</Node>`);
	return lines.join('\n');
}

/** Deterministic bounded markup projection of a GraphDocument. */
export function printGraphMarkup(doc: GraphDocument): string {
	const lines = [`<PlanetGraph version="${escapeAttr(doc.version)}">`];

	for (const node of [...doc.nodes].sort((a, b) => a.id.localeCompare(b.id))) {
		lines.push(printNode(node, 1));
	}

	for (const edge of [...doc.edges].sort((a, b) => a.id.localeCompare(b.id))) {
		lines.push(
			`${INDENT}<Edge id="${escapeAttr(edge.id)}" from="${portRef(edge.from)}" to="${portRef(edge.to)}" />`
		);
	}

	for (const output of doc.outputs) {
		lines.push(
			`${INDENT}<Output name="${escapeAttr(output.name)}" from="${portRef(output.from)}" />`
		);
	}

	for (const consumer of doc.consumers) {
		lines.push(
			`${INDENT}<Consumer type="${escapeAttr(consumer.type)}" outputs="${escapeAttr(consumer.outputs.join(','))}" />`
		);
	}

	lines.push('</PlanetGraph>');
	return lines.join('\n');
}
