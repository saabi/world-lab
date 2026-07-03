import '@world-lab/graph';
import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import { animatedWorleyPipelineGraph } from './defaultGraph.js';
import NodePalette from './NodePalette.svelte';
import {
	PALETTE_PRIMITIVE_MIME,
	readPalettePrimitiveId,
	resolvePaletteDrop,
	writePaletteDragData
} from './paletteDrag.js';

describe('paletteDrag helpers', () => {
	it('writePaletteDragData sets the primitive mime payload', () => {
		const dataTransfer = new DataTransfer();
		writePaletteDragData(dataTransfer, 'noise.perlin3d');
		expect(dataTransfer.getData(PALETTE_PRIMITIVE_MIME)).toBe('noise.perlin3d');
		expect(dataTransfer.effectAllowed).toBe('copy');
	});

	it('resolvePaletteDrop adds a node at the given flow position', () => {
		const graph = animatedWorleyPipelineGraph();
		const before = graph.nodes.length;
		const { next } = resolvePaletteDrop(graph, 'noise.perlin3d', { x: 120, y: 80 });
		expect(next.nodes).toHaveLength(before + 1);
		expect(next.nodes.at(-1)?.primitive).toBe('noise.perlin3d');
		expect(next.nodes.at(-1)?.position).toEqual({ x: 120, y: 80 });
	});
});

describe('NodePalette drag start', () => {
	it('sets palette drag data on primitive button dragstart', async () => {
		const { container } = render(NodePalette);
		const search = screen.getByPlaceholderText('Search nodes…');
		await fireEvent.input(search, { target: { value: 'perlin3d' } });

		const item = container.querySelector('.item');
		expect(item).not.toBeNull();

		const dataTransfer = new DataTransfer();
		fireEvent.dragStart(item!, { dataTransfer });

		expect(readPalettePrimitiveId(dataTransfer)).toBe('noise.perlin3d');
	});
});
