import type { DataType, PortDefaultValue, SemanticTag, SpaceId } from '@world-lab/graph';

export type PortBindingSource =
	| { kind: 'edge'; edgeId: string; fromNode: string; fromPort: string }
	| { kind: 'host'; inputId: string }
	| { kind: 'default'; value: PortDefaultValue }
	| { kind: 'unconnected' };

export interface PortBindingState {
	portId: string;
	name: string;
	dataType: DataType;
	space?: SpaceId;
	semantics?: SemanticTag[];
	source: PortBindingSource;
}
