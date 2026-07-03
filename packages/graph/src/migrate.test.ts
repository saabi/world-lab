import { Type } from '@world-lab/schema';
import { describe, expect, it } from 'vitest';

import { discoverExecutionRoots } from './executionRoots.js';
import { migrateGraphDocument } from './migrate.js';
import { registerPrimitive } from './registry.js';
import { deserializeGraph, serializeGraph } from './serialize.js';
import type {
	GraphDocumentV1,
	GraphDocumentV2,
	Node,
	ProceduralConsumer
} from './types.js';

import './primitives/index.js';

registerPrimitive({
	id: 'test.migrationScalar',
	category: 'test',
	inputs: [],
	outputs: [{ name: 'value', dataType: 'f32' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'test.migrationScalar', entry: 'migration_scalar' }
});
registerPrimitive({
	id: 'test.migrationColor',
	category: 'test',
	inputs: [],
	outputs: [{ name: 'color', dataType: 'vec4f' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'test.migrationColor', entry: 'migration_color' }
});
registerPrimitive({
	id: 'test.novelExecutionRoot',
	category: 'test',
	inputs: [],
	outputs: [],
	params: Type.Object({}),
	implementation: {
		kind: 'sink',
		sink: {
			kind: 'novel',
			deriveInvocation(_doc, node) {
				return { sinkKind: 'novel', nodeId: node.id, dependencies: [], payload: null };
			}
		}
	}
});

function sourceNode(id: string, primitive: string, port: string, dataType: 'f32' | 'vec4f'): Node {
	return {
		id,
		primitive,
		inputs: [],
		outputs: [{ id: port, name: port, direction: 'out', dataType }]
	};
}

function legacyDocument(
	consumers: ProceduralConsumer[],
	dataType: 'f32' | 'vec4f' = 'f32'
): GraphDocumentV1 {
	const port = dataType === 'vec4f' ? 'color' : 'value';
	const primitive = dataType === 'vec4f' ? 'test.migrationColor' : 'test.migrationScalar';
	return {
		version: '1',
		nodes: [sourceNode('source', primitive, port, dataType)],
		edges: [],
		outputs: [{ name: 'result', from: { node: 'source', port } }],
		consumers
	};
}

describe('GraphDocument v1 migration', () => {
	it.each([
		'vertex-pass',
		'fragment-pass',
		'veg-compute',
		'terrain-mesh',
		'future-unknown-type'
	])('preserves %s as a compatibility execution root', (type) => {
		const migrated = migrateGraphDocument(
			legacyDocument([{ type, stage: 'compute', outputs: ['result'] }])
		);
		const roots = discoverExecutionRoots(migrated);
		expect(roots).toHaveLength(1);
		expect(roots[0]?.primitive).toBe('legacy.consumerSink');
		expect(roots[0]?.params).toMatchObject({ type, outputs: ['result'] });
	});

	it('migrates preview and verified vec4 image consumers to elemental sinks', () => {
		const preview = migrateGraphDocument(
			legacyDocument([{ type: 'preview', outputs: ['result'] }])
		);
		expect(discoverExecutionRoots(preview).map((node) => node.primitive)).toEqual([
			'preview.fieldSink'
		]);

		const image = migrateGraphDocument(
			legacyDocument(
				[{ type: 'image', id: 'image', stage: 'fragment', outputs: ['result'] }],
				'vec4f'
			)
		);
		expect(image.nodes.map((node) => node.primitive)).toEqual(
			expect.arrayContaining([
				'geometry.plane',
				'buffer.persist',
				'stage.vertex',
				'stage.fragment',
				'target.display'
			])
		);
		expect(discoverExecutionRoots(image).map((node) => node.primitive)).toContain(
			'target.display'
		);
	});

	it('routes a malformed non-vec4 image consumer through the compatibility sink', () => {
		const migrated = migrateGraphDocument(
			legacyDocument([{ type: 'image', stage: 'fragment', outputs: ['result'] }])
		);
		expect(discoverExecutionRoots(migrated)[0]?.primitive).toBe('legacy.consumerSink');
	});

	it('processes an unrelated consumer even when a matching display root already exists', () => {
		const imageConsumer: ProceduralConsumer = {
			type: 'image',
			id: 'image',
			stage: 'fragment',
			outputs: ['result']
		};
		const withDisplay = migrateGraphDocument(legacyDocument([imageConsumer], 'vec4f'));
		const remigrationInput: GraphDocumentV1 = {
			...withDisplay,
			version: '1',
			consumers: [imageConsumer, { type: 'veg-compute', outputs: ['result'] }]
		};
		const migrated = migrateGraphDocument(remigrationInput);
		expect(migrated.nodes.filter((node) => node.primitive === 'target.display')).toHaveLength(1);
		expect(migrated.nodes.filter((node) => node.primitive === 'legacy.consumerSink')).toHaveLength(
			1
		);
	});

	it('is deterministic, collision-free, and a no-op for v2 documents', () => {
		const input = legacyDocument(
			[{ type: 'image', stage: 'fragment', outputs: ['result'] }],
			'vec4f'
		);
		input.nodes.push({ ...input.nodes[0]!, id: 'geometry.plane' });
		const first = migrateGraphDocument(input);
		const second = migrateGraphDocument(input);
		expect(serializeGraph(first)).toBe(serializeGraph(second));
		expect(new Set(first.nodes.map((node) => node.id)).size).toBe(first.nodes.length);
		expect(new Set(first.edges.map((edge) => edge.id)).size).toBe(first.edges.length);
		expect(migrateGraphDocument(first)).toBe(first);
	});

	it('deserializes both versions to normalized v2 documents', () => {
		const v1 = legacyDocument([{ type: 'preview', outputs: ['result'] }]);
		// @ts-expect-error Raw v1 documents must cross the migration boundary before canonical use.
		const _canonicalWithoutMigration: GraphDocumentV2 = v1;
		void _canonicalWithoutMigration;
		const fromV1 = deserializeGraph(JSON.stringify(v1));
		expect(fromV1.version).toBe('2');
		expect(discoverExecutionRoots(fromV1)[0]?.primitive).toBe('preview.fieldSink');

		const v2: GraphDocumentV2 = { version: '2', nodes: [], edges: [], outputs: [] };
		expect(deserializeGraph(JSON.stringify(v2))).toEqual(v2);
	});
});

describe('execution-root discovery', () => {
	it('finds a novel sink solely through implementation.kind', () => {
		const doc: GraphDocumentV2 = {
			version: '2',
			nodes: [
				{
					id: 'novel',
					primitive: 'test.novelExecutionRoot',
					inputs: [],
					outputs: []
				}
			],
			edges: [],
			outputs: []
		};
		expect(discoverExecutionRoots(doc).map((node) => node.id)).toEqual(['novel']);
	});
});
