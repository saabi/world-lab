import type { TSchema } from '@world-lab/schema';

import type { PortDefaultValue } from './dataType.js';

export type ValueDataType = 'f32' | 'vec2f' | 'vec3f' | 'vec4f' | 'bool';
/** External input resources (image/mesh/audio) — see `ResourceDependency`. */
export type ResourceDataType = 'image' | 'mesh' | 'audio';
/** Internal pipeline resources (geometry/buffers/targets) — pipeline-as-graph.md. */
export type PipelineResourceType =
	| 'geometry'
	| 'varyings'
	| 'texture'
	| 'vertexBuffer'
	| 'indexBuffer'
	| 'renderTarget'
	| 'bindGroup'
	| 'storageBuffer';
export type ListDataType = 'tuple<f32>' | 'tuple<vec2f>' | 'tuple<vec3f>' | 'tuple<vec4f>';
export type DataType = ValueDataType | ResourceDataType | PipelineResourceType | ListDataType;

export type ScalarType = 'bool' | 'i32' | 'u32' | 'f32' | 'f16';
export interface StructField {
	name: string;
	type: TypeRef;
}
export type BufferAccess = 'read' | 'read-write';
export type BufferUsageFlag =
	| 'vertex'
	| 'index'
	| 'uniform'
	| 'storage'
	| 'copy-src'
	| 'copy-dst'
	| 'indirect'
	| 'query-resolve';
export type BufferUsage = BufferUsageFlag;
export type TextureDimension = '1d' | '2d' | '3d' | 'cube';
export type SampleType = 'float' | 'depth' | 'sint' | 'uint';
export type StorageTextureAccess = 'read' | 'write' | 'read-write';
export type TypeRef =
	| { kind: 'scalar'; scalar: ScalarType }
	| { kind: 'vector'; element: ScalarType; width: 2 | 3 | 4 }
	| { kind: 'matrix'; element: 'f32' | 'f16'; columns: 2 | 3 | 4; rows: 2 | 3 | 4 }
	| { kind: 'array'; element: TypeRef; length?: number }
	| { kind: 'struct'; id: string; fields: StructField[] }
	| { kind: 'buffer'; element: TypeRef; access: BufferAccess; usages: BufferUsage[] }
	| {
			kind: 'texture';
			dimension: TextureDimension;
			sample: SampleType;
			format?: string;
			access?: StorageTextureAccess;
	  }
	| { kind: 'sampler'; filtering: boolean; comparison: boolean }
	| { kind: 'mesh'; vertex: TypeRef; index?: ScalarType }
	| { kind: 'command'; command: string }
	| { kind: 'legacy'; alias: DataType };

/** Open identifier for a coordinate space. 'none' remains the non-spatial default. */
export type SpaceId = string;
export type SemanticTag = string;
/** @deprecated Use SpaceId. */
export type CoordinateSpace = SpaceId;

export interface Port {
	id: string;
	name: string;
	direction: 'in' | 'out';
	/** Canonical structural type. Optional only while loading legacy v1 documents. */
	type?: TypeRef;
	/** @deprecated Compatibility/display alias; absent when no DataType equivalent exists. */
	dataType?: DataType;
	space?: SpaceId; // defaults to 'none'
	semantics?: SemanticTag[];
	/** Literal used when the input port has no incoming edge. */
	default?: PortDefaultValue;
}

export interface Node {
	id: string;
	primitive: string; // primitive id, e.g. 'noise.perlin3d'
	/** Editor-only display label; falls back to `primitive` when unset or blank. */
	name?: string;
	params?: Record<string, unknown>;
	inputs: Port[];
	outputs: Port[];
	position?: { x: number; y: number }; // editor-only metadata
}

export interface PortRef {
	node: string;
	port: string;
}

export interface Edge {
	id: string;
	from: PortRef; // an output port
	to: PortRef; // an input port
}

export interface GraphOutput {
	name: string;
	from: PortRef;
}

/** WebGPU pipeline stage a consumer's outputs feed (see graph-and-compiler.md). */
export type PipelineStage = 'compute' | 'vertex' | 'fragment' | 'mesh-gen';

export interface ProceduralConsumer {
	type: string;
	outputs: string[];
	/** Stable id (defaults to `type` when absent). */
	id?: string;
	/** Which pipeline stage consumes these outputs. */
	stage?: PipelineStage;
}

export interface ResourceDependency {
	id: string;
	type: ResourceDataType;
}

export interface GraphDocumentBase {
	nodes: Node[];
	edges: Edge[];
	outputs: GraphOutput[];
	resources?: ResourceDependency[];
}

export interface GraphDocumentV1 extends GraphDocumentBase {
	version: '1';
	consumers: ProceduralConsumer[];
}

export interface GraphDocumentV2 extends GraphDocumentBase {
	version: '2';
}

export type GraphDocument = GraphDocumentV2;
export type AnyGraphDocument = GraphDocumentV1 | GraphDocumentV2;

export interface GroupInputMapping {
	name: string;
	dataType: DataType;
	space?: SpaceId;
	semantics?: SemanticTag[];
	target: PortRef;
}

/** Maps a group-level param to an internal subgraph input port. */
export interface GroupParamMapping {
	name: string;
	target: PortRef;
}

export interface GroupOutputMapping {
	name: string;
	dataType: DataType;
	space?: SpaceId;
	semantics?: SemanticTag[];
	target: PortRef;
}

export interface GroupInterface {
	inputs: GroupInputMapping[];
	params?: GroupParamMapping[];
	outputs: GroupOutputMapping[];
}

export interface GroupDefinition {
	id: string;
	category: string;
	subgraph: GraphDocument;
	interface: GroupInterface;
	/** TypeBox object schema — sole source of param type/default/widget metadata. */
	params?: TSchema;
	role?: string;
	help?: string;
	usage?: string;
}
