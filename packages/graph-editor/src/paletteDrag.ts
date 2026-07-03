import type { GraphDocument } from '@world-lab/graph';

import { applyEditIntent } from './irAdapter.js';

export const PALETTE_PRIMITIVE_MIME = 'application/x-world-lab-graph-primitive';

export function writePaletteDragData(dataTransfer: DataTransfer, primitiveId: string): void {
	dataTransfer.setData(PALETTE_PRIMITIVE_MIME, primitiveId);
	dataTransfer.effectAllowed = 'copy';
}

export function hasPaletteDrag(dataTransfer: DataTransfer | null): boolean {
	return dataTransfer?.types.includes(PALETTE_PRIMITIVE_MIME) ?? false;
}

export function readPalettePrimitiveId(dataTransfer: DataTransfer | null): string | null {
	if (!dataTransfer) return null;
	const primitiveId = dataTransfer.getData(PALETTE_PRIMITIVE_MIME);
	return primitiveId.length > 0 ? primitiveId : null;
}

export function resolvePaletteDrop(
	graph: GraphDocument,
	primitiveId: string,
	position: { x: number; y: number }
) {
	return {
		next: applyEditIntent(graph, { kind: 'add-node', primitiveId, position }),
		historyLabel: 'Add node' as const
	};
}
