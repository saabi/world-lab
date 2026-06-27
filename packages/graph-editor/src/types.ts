import type { CoordinateSpace, DataType } from '@virtual-planet/graph';

export type PortBindingSource =
	| { kind: 'edge'; edgeId: string; fromNode: string; fromPort: string }
	| { kind: 'host'; inputId: string }
	| { kind: 'unconnected' };

export interface PortBindingState {
	portId: string;
	name: string;
	dataType: DataType;
	space?: CoordinateSpace;
	source: PortBindingSource;
}
