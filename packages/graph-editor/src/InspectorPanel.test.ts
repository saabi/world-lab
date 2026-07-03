import '@world-lab/graph';
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { getPrimitive, paramInputPorts, type GraphDocument } from '@world-lab/graph';

import InspectorPanel from './InspectorPanel.svelte';

function perlinNodeDoc(name?: string): GraphDocument {
	return {
		version: '2',
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
	};
}

function remapWithDrivenParamDoc(): GraphDocument {
	const remap = getPrimitive('math.remap')!;
	return {
		version: '2',
		nodes: [
			{
				id: 'n_src',
				primitive: 'constant.f32',
				params: { value: 10 },
				inputs: [],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
			},
			{
				id: 'n_remap',
				primitive: 'math.remap',
				params: { inMin: 0, inMax: 1, outMin: 0, outMax: 1 },
				inputs: [
					{ id: 'x', name: 'x', direction: 'in', dataType: 'f32' },
					...paramInputPorts(remap).map((port) => ({
						id: port.name,
						name: port.name,
						direction: 'in' as const,
						dataType: port.dataType
					}))
				],
				outputs: [{ id: 'value', name: 'value', direction: 'out', dataType: 'f32' }]
			}
		],
		edges: [
			{
				id: 'e_inMax',
				from: { node: 'n_src', port: 'value' },
				to: { node: 'n_remap', port: 'inMax' }
			}
		],
		outputs: [],
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

describe('InspectorPanel param bindings', () => {
	it('shows driven-by label and hides control for edge-bound params', () => {
		const graph = remapWithDrivenParamDoc();
		const { container } = render(InspectorPanel, {
			props: { graph, nodeId: 'n_remap' }
		});

		const driven = container.querySelector('.driven-label');
		expect(driven?.textContent).toContain('driven by n_src.value');

		const inMaxField = Array.from(container.querySelectorAll('.field')).find((field) =>
			field.textContent?.includes('inMax')
		);
		expect(inMaxField?.querySelector('input')).toBeNull();
		expect(inMaxField?.classList.contains('driven')).toBe(true);

		const inMinField = Array.from(container.querySelectorAll('.field')).find((field) =>
			field.textContent?.includes('inMin')
		);
		expect(inMinField?.querySelector('input[type="number"]')).not.toBeNull();
	});
});
