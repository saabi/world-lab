import { describe, expect, it } from 'vitest';

import {
	buildPassOrder,
	resolveBufferSizes,
	resolveTargetSizes,
	validatePassGraph
} from './order.js';
import type {
	BufferResourceTarget,
	PassGraph,
	ResourceTarget,
	TextureResourceTarget
} from './types.js';

function textureTarget(
	id: string,
	lifetime: TextureResourceTarget['lifetime'] = { kind: 'transient' },
	size: TextureResourceTarget['size'] = { kind: 'screen-relative', scale: 1 }
): TextureResourceTarget {
	return {
		id,
		shape: {
			kind: 'texture',
			dimension: '2d',
			sample: 'float',
			format: 'rgba8unorm'
		},
		lifetime,
		size
	};
}

function bufferTarget(
	id: string,
	lifetime: BufferResourceTarget['lifetime'] = { kind: 'transient' },
	count = 256
): BufferResourceTarget {
	return {
		id,
		shape: {
			kind: 'buffer',
			element: { kind: 'scalar', scalar: 'f32' },
			access: 'read-write',
			usages: ['storage']
		},
		lifetime,
		size: { kind: 'element-count', count }
	};
}

function chainGraph(): PassGraph {
	return {
		targets: [textureTarget('A'), textureTarget('B')],
		passes: [
			{ consumerId: 'A', writeTarget: 'A', reads: [] },
			{ consumerId: 'B', writeTarget: 'B', reads: [{ channel: 0, target: 'A' }] }
		],
		display: 'B'
	};
}

describe('@world-lab/runtime-webgpu frameGraph resource types', () => {
	it('supports buffer and texture targets in one pass graph', () => {
		const graph: PassGraph = {
			targets: [
				bufferTarget('State', { kind: 'history', slots: 2 }),
				textureTarget('Image')
			],
			passes: [
				{
					consumerId: 'Update',
					writeTarget: 'State',
					reads: [{ channel: 0, target: 'State', version: 'previous' }]
				},
				{
					consumerId: 'Draw',
					writeTarget: 'Image',
					reads: [{ channel: 0, target: 'State' }]
				}
			],
			display: 'Image'
		};
		expect(buildPassOrder(graph).order).toEqual(['Update', 'Draw']);
	});

	it('excludes samplers and mismatched shape/size pairs at compile time', () => {
		const sampler: ResourceTarget = {
			id: 'sampler',
			// @ts-expect-error Samplers are bindings, not writable frame-graph targets.
			shape: { kind: 'sampler', filtering: true, comparison: false },
			lifetime: { kind: 'persistent' },
			size: { kind: 'element-count', count: 1 }
		};
		// @ts-expect-error Buffer targets require element-count sizing.
		const pixelSizedBuffer: ResourceTarget = {
			...bufferTarget('buffer'),
			size: { kind: 'fixed', width: 1, height: 1 }
		};
		// @ts-expect-error Texture targets require pixel sizing.
		const elementSizedTexture: ResourceTarget = {
			...textureTarget('texture'),
			size: { kind: 'element-count', count: 1 }
		};
		void sampler;
		void pixelSizedBuffer;
		void elementSizedTexture;
	});
});

describe('@world-lab/runtime-webgpu frameGraph order', () => {
	it('orders a chain, retains display lifetime, and does not infer feedback', () => {
		const result = buildPassOrder(chainGraph());

		expect(result.order).toEqual(['A', 'B']);
		expect(result.feedbackTargets).toEqual([]);
		expect(result.lifetimes.A).toEqual({ firstWrite: 0, lastRead: 1 });
		expect(result.lifetimes.B).toEqual({ firstWrite: 1, lastRead: 1 });
	});

	it('marks history self-reads as feedback without erroring', () => {
		const graph: PassGraph = {
			targets: [
				textureTarget(
					'State',
					{ kind: 'history', slots: 2 },
					{ kind: 'fixed', width: 64, height: 64 }
				)
			],
			passes: [
				{
					consumerId: 'Life',
					writeTarget: 'State',
					reads: [{ channel: 0, target: 'State', version: 'previous' }]
				}
			],
			display: 'State'
		};

		const result = buildPassOrder(graph);
		expect(result.order).toEqual(['Life']);
		expect(result.feedbackTargets).toEqual(['State']);
	});

	it('detects buffer history but not persistent resources as feedback', () => {
		const graph: PassGraph = {
			targets: [
				bufferTarget('History', { kind: 'history', slots: 2 }),
				bufferTarget('Persistent', { kind: 'persistent' })
			],
			passes: [
				{
					consumerId: 'HistoryPass',
					writeTarget: 'History',
					reads: [{ channel: 0, target: 'History', version: 'previous' }]
				},
				{ consumerId: 'PersistentPass', writeTarget: 'Persistent', reads: [] }
			],
			display: 'Persistent'
		};
		expect(buildPassOrder(graph).feedbackTargets).toEqual(['History']);
	});

	it('retains the displayed target through the end of the frame without feedback', () => {
		const graph: PassGraph = {
			targets: [textureTarget('Display'), bufferTarget('Later')],
			passes: [
				{ consumerId: 'DisplayPass', writeTarget: 'Display', reads: [] },
				{ consumerId: 'LaterPass', writeTarget: 'Later', reads: [] }
			],
			display: 'Display'
		};
		const result = buildPassOrder(graph);
		expect(result.lifetimes.Display).toEqual({ firstWrite: 0, lastRead: 1 });
		expect(result.feedbackTargets).toEqual([]);
	});

	it.each(['transient', 'persistent'] as const)(
		'rejects previous reads from %s resources',
		(kind) => {
			const graph: PassGraph = {
				targets: [bufferTarget('State', { kind })],
				passes: [
					{
						consumerId: 'Update',
						writeTarget: 'State',
						reads: [{ channel: 0, target: 'State', version: 'previous' }]
					}
				],
				display: 'State'
			};
			expect(validatePassGraph(graph)).toContainEqual({
				kind: 'invalid-history-read',
				pass: 'Update',
				target: 'State'
			});
			expect(() => buildPassOrder(graph)).toThrow(/non-history/i);
		}
	);

	it('reports read-write-same-pass for current-version reads', () => {
		const graph: PassGraph = {
			targets: [textureTarget('T')],
			passes: [
				{ consumerId: 'Bad', writeTarget: 'T', reads: [{ channel: 0, target: 'T' }] }
			],
			display: 'T'
		};
		expect(validatePassGraph(graph)).toContainEqual({
			kind: 'read-write-same-pass',
			pass: 'Bad',
			target: 'T'
		});
		expect(() => buildPassOrder(graph)).toThrow(/current write target/i);
	});

	it('reports intra-frame cycles from current-version reads', () => {
		const graph: PassGraph = {
			targets: [textureTarget('TA'), textureTarget('TB')],
			passes: [
				{ consumerId: 'PassA', writeTarget: 'TA', reads: [{ channel: 0, target: 'TB' }] },
				{ consumerId: 'PassB', writeTarget: 'TB', reads: [{ channel: 0, target: 'TA' }] }
			],
			display: 'TB'
		};

		expect(validatePassGraph(graph).some((issue) => issue.kind === 'intra-frame-cycle')).toBe(true);
		expect(() => buildPassOrder(graph)).toThrow(/cycle/i);
	});

	it('reports dangling target references', () => {
		const issues = validatePassGraph({
			targets: [textureTarget('A')],
			passes: [
				{
					consumerId: 'Reader',
					writeTarget: 'A',
					reads: [{ channel: 0, target: 'Missing' }]
				}
			],
			display: 'A'
		});
		expect(issues).toContainEqual({
			kind: 'dangling-target',
			pass: 'Reader',
			target: 'Missing'
		});
	});

	it('keeps optional pass bindings inert', () => {
		const withoutBindings = chainGraph();
		const withBindings: PassGraph = {
			...chainGraph(),
			passes: chainGraph().passes.map((pass) => ({
				...pass,
				bindings: [{ resourceId: pass.writeTarget, access: 'write' }]
			}))
		};
		expect(buildPassOrder(withBindings)).toEqual(buildPassOrder(withoutBindings));
	});

	it('resolves texture and buffer sizes independently from one graph', () => {
		const graph: PassGraph = {
			targets: [
				textureTarget('Full'),
				textureTarget('Half', { kind: 'transient' }, { kind: 'screen-relative', scale: 0.5 }),
				textureTarget('Fixed', { kind: 'transient' }, { kind: 'fixed', width: 320, height: 240 }),
				bufferTarget('State', { kind: 'persistent' }, 512)
			],
			passes: [],
			display: 'Full'
		};

		expect(resolveTargetSizes(graph, { width: 800, height: 600 })).toEqual({
			Full: { width: 800, height: 600 },
			Half: { width: 400, height: 300 },
			Fixed: { width: 320, height: 240 }
		});
		expect(resolveBufferSizes(graph)).toEqual({ State: { elementCount: 512 } });
	});
});
