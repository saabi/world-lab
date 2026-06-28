export type ValueDataType = 'f32' | 'vec2f' | 'vec3f' | 'vec4f' | 'bool';
/** External input resources (image/mesh/audio) — see `ResourceDependency`. */
export type ResourceDataType = 'image' | 'mesh' | 'audio';
/** Internal pipeline resources (geometry/buffers/targets) — pipeline-as-graph.md. */
export type PipelineResourceType =
	| 'geometry'
	| 'vertexBuffer'
	| 'indexBuffer'
	| 'renderTarget'
	| 'bindGroup'
	| 'storageBuffer';
export type ListDataType = 'list<f32>' | 'list<vec2f>' | 'list<vec3f>' | 'list<vec4f>';
export type DataType = ValueDataType | ResourceDataType | PipelineResourceType | ListDataType;

/** Coordinate space for spatial ports (see graph-and-compiler.md). 'none' = not spatial. */
export type CoordinateSpace =
	| 'none'
	| 'world_dir'
	| 'body_dir'
	| 'world_pos'
	| 'body_pos'
	| 'ideal_fragment_body_dir'
	| 'height_meters'
	| 'world_radius_meters'
	| 'scale_ctx';

export interface Port {
	id: string;
	name: string;
	direction: 'in' | 'out';
	dataType: DataType;
	space?: CoordinateSpace; // defaults to 'none'
}

export interface Node {
	id: string;
	primitive: string; // primitive id, e.g. 'noise.perlin3d'
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
	space?: CoordinateSpace;
	target: PortRef;
}

export interface GroupOutputMapping {
	name: string;
	dataType: DataType;
	space?: CoordinateSpace;
	target: PortRef;
}

export interface GroupInterface {
	inputs: GroupInputMapping[];
	outputs: GroupOutputMapping[];
}

export interface GroupDefinition {
	id: string;
	category: string;
	subgraph: GraphDocument;
	interface: GroupInterface;
	role?: string;
	help?: string;
	usage?: string;
}

