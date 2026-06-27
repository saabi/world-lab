export type DataType = 'f32' | 'vec2f' | 'vec3f' | 'vec4f' | 'bool';

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

export interface ProceduralConsumer {
	type: string;
	outputs: string[];
}

export interface GraphDocument {
	version: string;
	nodes: Node[];
	edges: Edge[];
	outputs: GraphOutput[];
	consumers: ProceduralConsumer[];
}
