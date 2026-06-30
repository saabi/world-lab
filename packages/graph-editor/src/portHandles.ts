/** xyflow handle id for an input port (distinct from same-named outputs on one node). */
export function inputHandleId(portId: string): string {
	return `in:${portId}`;
}

/** xyflow handle id for an output port. */
export function outputHandleId(portId: string): string {
	return `out:${portId}`;
}

/** Map a flow handle id back to the graph port id. */
export function portIdFromHandle(handleId: string | null | undefined): string | null {
	if (!handleId) return null;
	if (handleId.startsWith('in:')) return handleId.slice(3);
	if (handleId.startsWith('out:')) return handleId.slice(4);
	return handleId;
}
