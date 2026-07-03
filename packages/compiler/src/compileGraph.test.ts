import { describe, expect, it } from 'vitest';
import { migrateGraphDocument, registerPrimitive } from '@world-lab/graph';
import type { GraphDocument } from '@world-lab/graph';
import { Type } from '@world-lab/schema';
import { compileConsumers, compileGraph } from './compileGraph.js';
import type { WgslModule, WgslModuleResolver } from './codegen.js';
import {
	compileLegacyConsumerSinks,
	legacyConsumerDescriptors
} from './sinkAdapters.js';

// Distinct module per primitive so cross-consumer sharing is observable.
registerPrimitive({ id: 'cg.base', category: 'test', inputs: [], outputs: [{ name: 'value', dataType: 'f32' }], params: Type.Object({}), wgsl: { moduleId: 'mod.base', entry: 'base' } });
registerPrimitive({ id: 'cg.height', category: 'test', inputs: [{ name: 'x', dataType: 'f32' }], outputs: [{ name: 'value', dataType: 'f32' }], params: Type.Object({}), wgsl: { moduleId: 'mod.height', entry: 'height' } });
registerPrimitive({ id: 'cg.albedo', category: 'test', inputs: [{ name: 'x', dataType: 'f32' }], outputs: [{ name: 'value', dataType: 'f32' }], params: Type.Object({}), wgsl: { moduleId: 'mod.albedo', entry: 'albedo' } });
registerPrimitive({ id: 'cg.peaks', category: 'test', inputs: [], outputs: [{ name: 'value', dataType: 'f32' }], params: Type.Object({}), wgsl: { moduleId: 'mod.peaks', entry: 'peaks' } });

const modules: Record<string, WgslModule> = {
	'mod.base': { id: 'mod.base', source: 'fn base() -> f32 { return 1.0; }' },
	'mod.height': { id: 'mod.height', source: 'fn height(x: f32) -> f32 { return x + 0.5; }' },
	'mod.albedo': { id: 'mod.albedo', source: 'fn albedo(x: f32) -> f32 { return x * 2.0; }' },
	'mod.peaks': { id: 'mod.peaks', source: 'fn peaks() -> f32 { return 9.0; }' },
};
const resolver: WgslModuleResolver = { resolve: async (id) => modules[id]! };

// base → height (vertex output), base → albedo (fragment output); peaks (compute, independent).
function graph(): GraphDocument {
	const node = (id: string, primitive: string, hasInput: boolean) => ({
		id,
		primitive,
		inputs: hasInput ? [{ id: 'x', name: 'x', direction: 'in' as const, dataType: 'f32' as const }] : [],
		outputs: [{ id: 'value', name: 'value', direction: 'out' as const, dataType: 'f32' as const }],
	});
	return migrateGraphDocument({
		version: '1',
		nodes: [node('n_base', 'cg.base', false), node('n_h', 'cg.height', true), node('n_a', 'cg.albedo', true), node('n_p', 'cg.peaks', false)],
		edges: [
			{ id: 'e_h', from: { node: 'n_base', port: 'value' }, to: { node: 'n_h', port: 'x' } },
			{ id: 'e_a', from: { node: 'n_base', port: 'value' }, to: { node: 'n_a', port: 'x' } },
		],
		outputs: [
			{ name: 'height', from: { node: 'n_h', port: 'value' } },
			{ name: 'albedo', from: { node: 'n_a', port: 'value' } },
			{ name: 'peaks', from: { node: 'n_p', port: 'value' } },
		],
		consumers: [
			{ type: 'vertex-pass', id: 'height', stage: 'vertex', outputs: ['height'] },
			{ type: 'fragment-pass', id: 'albedo', stage: 'fragment', outputs: ['albedo'] },
			{ type: 'veg-compute', id: 'peaks', stage: 'compute', outputs: ['peaks'] },
		],
	});
}

describe('@world-lab/compiler compileGraph', () => {
	it('compiles one shader per consumer with its stage', async () => {
		const r = await compileGraph(graph(), resolver);
		expect(r.shaders.map((s) => s.consumerId).sort()).toEqual(['albedo', 'height', 'peaks']);
		expect(r.shaders.find((s) => s.consumerId === 'height')!.stage).toBe('vertex');
		expect(r.shaders.find((s) => s.consumerId === 'peaks')!.stage).toBe('compute');
	});

	it('each shader contains only its slice (no unrelated functions)', async () => {
		const r = await compileGraph(graph(), resolver);
		const peaks = r.shaders.find((s) => s.consumerId === 'peaks')!;
		expect(peaks.code).toContain('fn peaks()');
		expect(peaks.code).not.toContain('fn base()');
		expect(peaks.code).not.toContain('fn albedo(');
		const height = r.shaders.find((s) => s.consumerId === 'height')!;
		expect(height.code).toContain('fn height(');
		expect(height.code).not.toContain('fn albedo(');
	});

	it('detects shared evaluation across consumers', async () => {
		const r = await compileGraph(graph(), resolver);
		// mod.base feeds both height and albedo consumers.
		expect(r.sharedModuleIds).toContain('mod.base');
		expect(r.sharedModuleIds).not.toContain('mod.peaks');
	});

	it('batches legacy sinks and matches direct descriptor compilation', async () => {
		const doc = graph();
		const descriptors = legacyConsumerDescriptors(doc);
		expect(descriptors).toHaveLength(3);
		const direct = await compileConsumers(doc, descriptors, resolver);
		const bridged = await compileLegacyConsumerSinks(doc, resolver);
		expect(bridged).toEqual(direct);
		expect(bridged.sharedModuleIds).toContain('mod.base');
	});

	it('compiles an explicit consumer subset', async () => {
		const r = await compileGraph(graph(), resolver, { consumers: [{ type: 'only', id: 'only', stage: 'fragment', outputs: ['albedo'] }] });
		expect(r.shaders).toHaveLength(1);
		expect(r.shaders[0]!.consumerId).toBe('only');
	});

	it('rejects an unknown output', async () => {
		await expect(compileGraph(graph(), resolver, { consumers: [{ type: 'bad', outputs: ['nope'] }] })).rejects.toThrow();
	});
});
