import '@world-lab/graph';
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import type { GraphDocument } from '@world-lab/graph';

import InspectorPanel from './InspectorPanel.svelte';

function perlinNodeDoc(name?: string): GraphDocument {
	return {
		version: '1',
		nodes: [
			{
				id: 'n_perlin',
				primitive: 'noise.perlin3d',
				...(name !== undefined ? { name } : {}),
				inputs: [
					{ id: 'position', name: 'position', direction: 'in', dataType: 'vec3f' }
				],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
			}
		],
		edges: [],
		outputs: [],
		consumers: []
	};
}

describe('InspectorPanel node rename', () => {
	it('fires set-name intent with the selected node id and history label', () => {
		const onchange = vi.fn();
		const graph = perlinNodeDoc();
		const { container } = render(InspectorPanel, {
			props: { graph, nodeId: 'n_perlin', onchange }
		});

		const input = container.querySelector('input.name-input') as HTMLInputElement;
		expect(input).not.toBeNull();
		expect(input.placeholder).toBe('noise.perlin3d');

		input.value = 'Detail noise';
		fireEvent.change(input);

		expect(onchange).toHaveBeenCalledTimes(1);
		const [nextDoc, historyLabel] = onchange.mock.calls[0] as [GraphDocument, string];
		expect(historyLabel).toBe('Rename node');
		expect(nextDoc.nodes[0]?.name).toBe('Detail noise');
	});
});
