import { describe, expect, it } from 'vitest';
import './primitives/index.js'; // register the standard library (math.*, noise.*, …)
import type { GraphDocument } from './types.js';
import { validateGraphCompleteness, validateGraphFull } from './validate.js';

const portIn = (id: string) => ({ id, name: id, direction: 'in' as const, dataType: 'f32' as const });
const portOut = (id: string) => ({ id, name: id, direction: 'out' as const, dataType: 'f32' as const });

// add(a,b) → out 'value'; the graph output reads it. Fully wired when both a,b connected.
function graph(opts: { connectB?: boolean; output?: { node: string; port: string }; extraNode?: boolean } = {}): GraphDocument {
	const nodes = [
		{ id: 'src1', primitive: 'noise.perlin3d', inputs: [{ id: 'position', name: 'position', direction: 'in' as const, dataType: 'vec3f' as const }], outputs: [portOut('value')] },
		{ id: 'src2', primitive: 'noise.perlin3d', inputs: [{ id: 'position', name: 'position', direction: 'in' as const, dataType: 'vec3f' as const }], outputs: [portOut('value')] },
		{ id: 'sum', primitive: 'math.add', inputs: [portIn('a'), portIn('b')], outputs: [portOut('value')] },
	];
	if (opts.extraNode) nodes.push({ id: 'orphan', primitive: 'math.add', inputs: [portIn('a'), portIn('b')], outputs: [portOut('value')] });
	const edges = [
		{ id: 'e1', from: { node: 'src1', port: 'value' }, to: { node: 'sum', port: 'a' } },
		...(opts.connectB !== false ? [{ id: 'e2', from: { node: 'src2', port: 'value' }, to: { node: 'sum', port: 'b' } }] : []),
	];
	return { version: '2', nodes, edges, outputs: [{ name: 'out', from: opts.output ?? { node: 'sum', port: 'value' } }] };
}

describe('@world-lab/graph validateGraphCompleteness', () => {
	it('a fully wired graph has no errors (unconnected runtime inputs are warnings)', () => {
		const r = validateGraphFull(graph());
		expect(r.ok).toBe(true); // perlin position is unconnected but only a warning
		expect(r.issues.every((i) => i.kind === 'unconnected-input')).toBe(true);
	});

	it('flags an unconnected data input as a warning (not an error)', () => {
		const r = validateGraphCompleteness(graph({ connectB: false }));
		expect(r.ok).toBe(true);
		expect(r.issues).toContainEqual({ kind: 'unconnected-input', node: 'sum', port: 'b' });
	});

	it('flags an unresolved primitive as an error', () => {
		const doc = graph();
		doc.nodes[2]!.primitive = 'math.doesNotExist';
		const r = validateGraphCompleteness(doc);
		expect(r.ok).toBe(false);
		expect(r.issues).toContainEqual({ kind: 'unresolved-primitive', node: 'sum', primitive: 'math.doesNotExist' });
	});

	it('flags an output referencing a missing node/port as an error', () => {
		const r = validateGraphCompleteness(graph({ output: { node: 'sum', port: 'nope' } }));
		expect(r.ok).toBe(false);
		expect(r.issues.some((i) => i.kind === 'no-output-path')).toBe(true);
	});

	it('flags a node not reachable from any output as a dangling warning', () => {
		const r = validateGraphCompleteness(graph({ extraNode: true }));
		expect(r.ok).toBe(true);
		expect(r.issues).toContainEqual({ kind: 'dangling-node', node: 'orphan' });
	});
});
