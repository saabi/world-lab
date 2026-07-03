import {
	getPrimitive,
	migrateGraphDocument,
	type AnyGraphDocument,
	type GraphDocument,
	type GraphOutput,
	type Node,
	type PortRef,
	type ProceduralConsumer
} from '@world-lab/graph';

import { resyncGraphPortMetadata } from '../graphSync.js';
import { instantiatePorts } from '../nodePortUtils.js';

export class MarkupParseError extends Error {
	readonly line?: number;
	readonly column?: number;

	constructor(message: string, line?: number, column?: number) {
		super(message);
		this.name = 'MarkupParseError';
		this.line = line;
		this.column = column;
	}
}

const ALLOWED_ROOT = 'PlanetGraph';
const ALLOWED_ROOT_CHILDREN = new Set(['Node', 'Edge', 'Output', 'Consumer']);
const ALLOWED_NODE_CHILDREN = new Set(['Param']);

interface XmlElement {
	name: string;
	attrs: Record<string, string>;
	children: XmlElement[];
	selfClosing: boolean;
	line: number;
	column: number;
}

function unescapeAttr(value: string): string {
	return value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
}

function parseParamValue(raw: string): unknown {
	if (raw === 'true') return true;
	if (raw === 'false') return false;
	if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) return Number(raw);
	return unescapeAttr(raw);
}

function parsePortRef(raw: string, context: string): PortRef {
	const dot = raw.indexOf('.');
	if (dot <= 0 || dot === raw.length - 1) {
		throw new MarkupParseError(`Invalid port ref "${raw}" on ${context}`);
	}
	return { node: raw.slice(0, dot), port: raw.slice(dot + 1) };
}

function parseAttributes(fragment: string): Record<string, string> {
	const attrs: Record<string, string> = {};
	const attrRe = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g;
	let match: RegExpExecArray | null;
	while ((match = attrRe.exec(fragment)) !== null) {
		attrs[match[1]!] = unescapeAttr(match[2]!);
	}
	return attrs;
}

function lineColumnAt(source: string, index: number): { line: number; column: number } {
	let line = 1;
	let column = 1;
	for (let i = 0; i < index; i++) {
		if (source[i] === '\n') {
			line++;
			column = 1;
		} else {
			column++;
		}
	}
	return { line, column };
}

function parseElements(source: string): XmlElement[] {
	const elements: XmlElement[] = [];
	const stack: XmlElement[] = [];
	let index = 0;

	while (index < source.length) {
		while (index < source.length && /\s/.test(source[index]!)) index++;
		if (index >= source.length) break;

		if (source[index] !== '<') {
			const { line, column } = lineColumnAt(source, index);
			throw new MarkupParseError('Expected markup element', line, column);
		}

		const tagStart = index;
		const { line, column } = lineColumnAt(source, index);
		index++;

		const closing = source[index] === '/';
		if (closing) index++;

		const nameStart = index;
		while (index < source.length && /[\w.-]/.test(source[index]!)) index++;
		const name = source.slice(nameStart, index);
		if (!name) {
			throw new MarkupParseError('Expected element name', line, column);
		}

		if (closing) {
			while (index < source.length && source[index] !== '>') index++;
			if (source[index] !== '>') {
				throw new MarkupParseError('Expected ">" closing tag', line, column);
			}
			index++;
			const open = stack.pop();
			if (!open || open.name !== name) {
				throw new MarkupParseError(`Unexpected closing tag </${name}>`, line, column);
			}
			continue;
		}

		const attrsStart = index;
		while (
			index < source.length &&
			source[index] !== '>' &&
			!(source[index] === '/' && source[index + 1] === '>')
		) {
			index++;
		}
		const attrs = parseAttributes(source.slice(attrsStart, index));
		const selfClosing = source[index] === '/';
		if (selfClosing) index++;
		if (source[index] !== '>') {
			throw new MarkupParseError('Expected ">" after element', line, column);
		}
		index++;

		const element: XmlElement = { name, attrs, children: [], selfClosing, line, column };

		if (selfClosing) {
			if (stack.length === 0) elements.push(element);
			else stack[stack.length - 1]!.children.push(element);
			continue;
		}

		if (stack.length === 0) elements.push(element);
		else stack[stack.length - 1]!.children.push(element);
		stack.push(element);
	}

	if (stack.length > 0) {
		const open = stack[stack.length - 1]!;
		throw new MarkupParseError(`Unclosed element <${open.name}>`, open.line, open.column);
	}

	return elements;
}

function requireAttr(element: XmlElement, name: string): string {
	const value = element.attrs[name];
	if (value === undefined) {
		throw new MarkupParseError(
			`<${element.name}> missing required attribute "${name}"`,
			element.line,
			element.column
		);
	}
	return value;
}

function parseNodeElement(element: XmlElement): Node {
	for (const child of element.children) {
		if (!ALLOWED_NODE_CHILDREN.has(child.name)) {
			throw new MarkupParseError(
				`Unknown element <${child.name}> inside <Node>`,
				child.line,
				child.column
			);
		}
	}

	const id = requireAttr(element, 'id');
	const primitive = requireAttr(element, 'primitive');
	const primitiveDef = getPrimitive(primitive);
	if (!primitiveDef) {
		throw new MarkupParseError(
			`Unknown primitive "${primitive}" on <Node id="${id}">`,
			element.line,
			element.column
		);
	}

	const params: Record<string, unknown> = {};
	for (const child of element.children) {
		if (child.name !== 'Param') continue;
		const name = requireAttr(child, 'name');
		params[name] = parseParamValue(requireAttr(child, 'value'));
	}

	const node: Node = {
		id,
		primitive,
		inputs: instantiatePorts(primitiveDef.inputs, 'in'),
		outputs: instantiatePorts(primitiveDef.outputs, 'out')
	};

	if (element.attrs.x !== undefined || element.attrs.y !== undefined) {
		const x = element.attrs.x !== undefined ? Number(element.attrs.x) : 0;
		const y = element.attrs.y !== undefined ? Number(element.attrs.y) : 0;
		if (Number.isNaN(x) || Number.isNaN(y)) {
			throw new MarkupParseError(
				`<Node id="${id}"> has invalid x/y coordinates`,
				element.line,
				element.column
			);
		}
		node.position = { x, y };
	}

	if (Object.keys(params).length > 0) {
		node.params = params;
	}

	return node;
}

function parseRoot(root: XmlElement): AnyGraphDocument {
	if (root.name !== ALLOWED_ROOT) {
		throw new MarkupParseError(
			`Expected root element <${ALLOWED_ROOT}>`,
			root.line,
			root.column
		);
	}

	const version = requireAttr(root, 'version');
	if (version !== '1' && version !== '2') {
		throw new MarkupParseError(`Unsupported graph version "${version}"`, root.line, root.column);
	}
	const nodes: Node[] = [];
	const edges: GraphDocument['edges'] = [];
	const outputs: GraphOutput[] = [];
	const consumers: ProceduralConsumer[] = [];

	for (const child of root.children) {
		if (!ALLOWED_ROOT_CHILDREN.has(child.name)) {
			throw new MarkupParseError(
				`Unknown element <${child.name}> inside <${ALLOWED_ROOT}>`,
				child.line,
				child.column
			);
		}

		switch (child.name) {
			case 'Node':
				nodes.push(parseNodeElement(child));
				break;
			case 'Edge':
				edges.push({
					id: requireAttr(child, 'id'),
					from: parsePortRef(requireAttr(child, 'from'), `<Edge id="${child.attrs.id ?? ''}">`),
					to: parsePortRef(requireAttr(child, 'to'), `<Edge id="${child.attrs.id ?? ''}">`)
				});
				break;
			case 'Output':
				outputs.push({
					name: requireAttr(child, 'name'),
					from: parsePortRef(requireAttr(child, 'from'), `<Output name="${child.attrs.name ?? ''}">`)
				});
				break;
			case 'Consumer': {
				const outputsAttr = requireAttr(child, 'outputs');
				consumers.push({
					type: requireAttr(child, 'type'),
					outputs: outputsAttr
						.split(',')
						.map((part) => part.trim())
						.filter(Boolean)
				});
				break;
			}
		}
	}

	nodes.sort((a, b) => a.id.localeCompare(b.id));
	edges.sort((a, b) => a.id.localeCompare(b.id));

	return version === '1'
		? { version, nodes, edges, outputs, consumers }
		: { version, nodes, edges, outputs };
}

/** Parse bounded PlanetGraph markup into a GraphDocument. */
export function parseGraphMarkup(source: string): GraphDocument {
	const trimmed = source.trim();
	if (!trimmed) {
		throw new MarkupParseError('Empty markup source', 1, 1);
	}

	const elements = parseElements(trimmed);
	if (elements.length !== 1) {
		throw new MarkupParseError('Markup must contain exactly one root element', 1, 1);
	}

	return resyncGraphPortMetadata(migrateGraphDocument(parseRoot(elements[0]!)));
}
