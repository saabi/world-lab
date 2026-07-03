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

/** Open identifier for a coordinate space. 'none' remains the non-spatial default. */
export type SpaceId = string;
export type SemanticTag = string;
/** @deprecated Use SpaceId. */
export type CoordinateSpace = SpaceId;

export interface Port {
	id: string;
	name: string;
	direction: 'in' | 'out';
	dataType: DataType;
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

export interface GraphDocument {
	version: string;
	nodes: Node[];
	edges: Edge[];
	outputs: GraphOutput[];
	consumers: ProceduralConsumer[];
	resources?: ResourceDependency[];
}

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
