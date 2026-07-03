import { resolvePortDataType, resolvePortType } from './dataType.js';
import { discoverExecutionRoots } from './executionRoots.js';
import {
	collectEdgeIds,
	collectNodeIds,
	dedupeGraphIds,
	mintEdgeId,
	mintNodeId
} from './graphIds.js';
import { DEFAULT_PIPELINE_GEOMETRY_PARAMS } from './pipelineGeometry.js';
import type { PortSpec } from './primitive.js';
import { getPrimitive } from './registry.js';
import type {
	AnyGraphDocument,
	Edge,
	GraphDocument,
	GraphDocumentV1,
	GraphDocumentV2,
	GraphOutput,
	Node,
	Port,
	ProceduralConsumer
} from './types.js';

export interface GraphMigrationPatch {
	nodes: Node[];
	edges: Edge[];
	outputs?: GraphOutput[];
}

export type LegacyConsumerMigration = (
	consumer: ProceduralConsumer,
	doc: GraphDocument
) => GraphMigrationPatch;

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		type: resolvePortType(spec),
		...(spec.dataType !== undefined ? { dataType: spec.dataType } : {}),
		space: spec.space ?? 'none',
		...(spec.semantics !== undefined ? { semantics: [...spec.semantics] } : {}),
		...(spec.default !== undefined ? { default: spec.default } : {})
	}));
}

function createNode(
	doc: GraphDocument,
	primitiveId: string,
	params?: Record<string, unknown>,
	position?: { x: number; y: number }
): Node {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) throw new Error(`Migration primitive is not registered: ${primitiveId}`);
	return {
		id: mintNodeId(collectNodeIds(doc), primitiveId),
		primitive: primitiveId,
		...(params ? { params } : {}),
		inputs: instantiatePorts(primitive.inputs, 'in'),
		outputs: instantiatePorts(primitive.outputs, 'out'),
		...(position ? { position } : {})
	};
}

function appendPatch(doc: GraphDocument, patch: GraphMigrationPatch): GraphDocument {
	return {
		...doc,
		nodes: [...doc.nodes, ...patch.nodes],
		edges: [...doc.edges, ...patch.edges],
		outputs: patch.outputs ?? doc.outputs
	};
}

function outputDataType(doc: GraphDocument, outputName: string): string | undefined {
	const output = doc.outputs.find((candidate) => candidate.name === outputName);
	const node = output && doc.nodes.find((candidate) => candidate.id === output.from.node);
	const port = node?.outputs.find((candidate) => candidate.id === output?.from.port);
	return port ? resolvePortDataType(port) : undefined;
}

function sameOutputs(left: readonly string[], right: readonly string[]): boolean {
	return left.length === right.length && left.every((output, index) => output === right[index]);
}

function consumerAlreadyRepresented(doc: GraphDocument, consumer: ProceduralConsumer): boolean {
	const invocations = discoverExecutionRoots(doc).flatMap((node) => {
		const primitive = getPrimitive(node.primitive);
		if (primitive?.implementation.kind !== 'sink') return [];
		const invocation = primitive.implementation.sink.deriveInvocation(doc, node);
		return invocation ? [invocation] : [];
	});

	if (consumer.type === 'preview') {
		return consumer.outputs.every((outputName) =>
			invocations.some(
				(invocation) =>
					invocation.sinkKind === 'fieldPreview' &&
					(invocation.payload as { outputName?: unknown }).outputName === outputName
			)
		);
	}
	if (consumer.type === 'image') {
		return invocations.some((invocation) => {
			if (invocation.sinkKind !== 'display') return false;
			const payload = invocation.payload as {
				consumer?: { type?: unknown; outputs?: unknown };
			};
			return (
				payload.consumer?.type === 'image' &&
				Array.isArray(payload.consumer.outputs) &&
				sameOutputs(payload.consumer.outputs as string[], consumer.outputs)
			);
		});
	}
	return invocations.some((invocation) => {
		if (invocation.sinkKind !== 'legacyConsumer') return false;
		const payload = invocation.payload as ProceduralConsumer;
		return (
			payload.type === consumer.type &&
			payload.stage === consumer.stage &&
			payload.id === consumer.id &&
			sameOutputs(payload.outputs, consumer.outputs)
		);
	});
}

const previewMigration: LegacyConsumerMigration = (consumer, doc) => {
	let working = doc;
	const nodes: Node[] = [];
	for (const outputName of consumer.outputs) {
		const output = doc.outputs.find((candidate) => candidate.name === outputName);
		const owner = output && doc.nodes.find((candidate) => candidate.id === output.from.node);
		const node = createNode(
			working,
			'preview.fieldSink',
			{ outputName },
			{ x: (owner?.position?.x ?? 0) + 260, y: owner?.position?.y ?? 0 }
		);
		nodes.push(node);
		working = { ...working, nodes: [...working.nodes, node] };
	}
	return { nodes, edges: [] };
};

const imageMigration: LegacyConsumerMigration = (consumer, doc) => {
	let working = doc;
	const nodes: Node[] = [];
	const edges: Edge[] = [];

	for (const [index, outputName] of consumer.outputs.entries()) {
		const output = doc.outputs.find((candidate) => candidate.name === outputName);
		if (!output) continue;
		const y = index * 180;
		const geometry = createNode(
			working,
			'geometry.plane',
			{ ...DEFAULT_PIPELINE_GEOMETRY_PARAMS },
			{ x: -700, y }
		);
		working = { ...working, nodes: [...working.nodes, geometry] };
		const persist = createNode(working, 'buffer.persist', undefined, { x: -480, y });
		working = { ...working, nodes: [...working.nodes, persist] };
		const vertex = createNode(working, 'stage.vertex', undefined, { x: -260, y });
		working = { ...working, nodes: [...working.nodes, vertex] };
		const fragment = createNode(working, 'stage.fragment', undefined, { x: 220, y });
		working = { ...working, nodes: [...working.nodes, fragment] };
		const display = createNode(working, 'target.display', undefined, { x: 460, y });
		working = { ...working, nodes: [...working.nodes, display] };
		nodes.push(geometry, persist, vertex, fragment, display);

		const connections: Array<[Node, string, Node, string]> = [
			[geometry, 'mesh', persist, 'in'],
			[persist, 'out', vertex, 'mesh'],
			[vertex, 'varyings', fragment, 'varyings'],
			[fragment, 'texture', display, 'color']
		];
		for (const [fromNode, fromPort, toNode, toPort] of connections) {
			const edge: Edge = {
				id: mintEdgeId(new Set([...collectEdgeIds(working), ...edges.map((item) => item.id)])),
				from: { node: fromNode.id, port: fromPort },
				to: { node: toNode.id, port: toPort }
			};
			edges.push(edge);
		}
		edges.push({
			id: mintEdgeId(new Set([...collectEdgeIds(working), ...edges.map((item) => item.id)])),
			from: output.from,
			to: { node: fragment.id, port: 'color' }
		});
	}
	return { nodes, edges };
};

const legacyMigration: LegacyConsumerMigration = (consumer, doc) => ({
	nodes: [
		createNode(
			doc,
			'legacy.consumerSink',
			{
				type: consumer.type,
				outputs: [...consumer.outputs],
				...(consumer.id !== undefined ? { id: consumer.id } : {}),
				...(consumer.stage !== undefined ? { stage: consumer.stage } : {})
			},
			{ x: 520, y: doc.nodes.length * 24 }
		)
	],
	edges: []
});

export const LEGACY_CONSUMER_MIGRATIONS = new Map<string, LegacyConsumerMigration>([
	['preview', previewMigration],
	['image', imageMigration]
]);

function canMigrateImage(consumer: ProceduralConsumer, doc: GraphDocument): boolean {
	return (
		consumer.outputs.length > 0 &&
		consumer.outputs.every((outputName) => outputDataType(doc, outputName) === 'vec4f')
	);
}

export function migrateGraphDocument(
	doc: GraphDocumentV1 | GraphDocumentV2
): GraphDocumentV2 {
	if (doc.version === '2') return doc;

	let migrated: GraphDocument = {
		version: '2',
		nodes: [...doc.nodes],
		edges: [...doc.edges],
		outputs: [...doc.outputs],
		...(doc.resources !== undefined ? { resources: [...doc.resources] } : {})
	};

	for (const consumer of doc.consumers) {
		if (consumerAlreadyRepresented(migrated, consumer)) continue;
		const migration =
			consumer.type === 'image' && !canMigrateImage(consumer, migrated)
				? legacyMigration
				: LEGACY_CONSUMER_MIGRATIONS.get(consumer.type) ?? legacyMigration;
		migrated = appendPatch(migrated, migration(consumer, migrated));
	}

	return dedupeGraphIds(migrated);
}

export function isGraphDocumentV1(doc: AnyGraphDocument): doc is GraphDocumentV1 {
	return doc.version === '1';
}
