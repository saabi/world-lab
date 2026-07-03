import '@world-lab/graph';
import { compatibleConsumers } from '@world-lab/graph';
import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import GraphNodeViewDirectHarness from './GraphNodeViewDirectHarness.svelte';
import type { FlowNodeData } from './irAdapter.js';

vi.mock('@xyflow/svelte', async (importOriginal) => {
	const actual = await importOriginal<typeof import('@xyflow/svelte')>();
	const { default: HandleMock } = await import('./testSupport/xyflowHandleMock.svelte');
	return {
		...actual,
		Handle: HandleMock
	};
});

const noiseNodeData: FlowNodeData = {
	nodeId: 'n_noise',
	primitiveId: 'noise.perlin3d',
	label: 'noise.perlin3d',
	inputs: [
		{
			id: 'position',
			name: 'position',
			direction: 'in',
			dataType: 'vec3f',
			space: 'none'
		}
	],
	outputs: [
		{
			id: 'value',
			name: 'value',
			direction: 'out',
			dataType: 'f32',
			space: 'none'
		}
	]
};

describe('GraphNodeView port keyboard connection', () => {
	it('exposes output ports with tabindex and an accessible label', () => {
		const { container } = render(GraphNodeViewDirectHarness, {
			props: { data: noiseNodeData }
		});

		const outputPort = container.querySelector('.port.out');
		expect(outputPort).not.toBeNull();
		expect(outputPort?.getAttribute('tabindex')).toBe('0');
		expect(outputPort?.getAttribute('aria-label')).toBe('Output port value, f32');
	});

	it('opens PortConnectMenu on Enter with the same matches as a context menu', () => {
		const { container } = render(GraphNodeViewDirectHarness, {
			props: { data: noiseNodeData }
		});

		const outputPort = container.querySelector('.port.out')!;
		const expectedCount = compatibleConsumers('f32').length;

		fireEvent.contextMenu(outputPort);
		const contextMenu = container.querySelector('.connect-menu');
		expect(contextMenu).not.toBeNull();
		expect(contextMenu!.querySelectorAll('button.item').length).toBe(expectedCount);

		fireEvent.keyDown(contextMenu!, { key: 'Escape' });
		expect(container.querySelector('.connect-menu')).toBeNull();

		fireEvent.keyDown(outputPort, { key: 'Enter' });
		const keyboardMenu = container.querySelector('.connect-menu');
		expect(keyboardMenu).not.toBeNull();
		expect(keyboardMenu!.querySelectorAll('button.item').length).toBe(expectedCount);
	});

	it('opens PortConnectMenu on Space', () => {
		const { container } = render(GraphNodeViewDirectHarness, {
			props: { data: noiseNodeData }
		});

		const outputPort = container.querySelector('.port.out')!;
		fireEvent.keyDown(outputPort, { key: ' ' });
		expect(container.querySelector('.connect-menu')).not.toBeNull();
	});

	it('closes PortConnectMenu on Escape and restores focus to the port', async () => {
		const { container } = render(GraphNodeViewDirectHarness, {
			props: { data: noiseNodeData }
		});

		const outputPort = container.querySelector('.port.out') as HTMLElement;
		outputPort.focus();
		fireEvent.keyDown(outputPort, { key: 'Enter' });
		expect(container.querySelector('.connect-menu')).not.toBeNull();

		const menu = container.querySelector('.connect-menu') as HTMLElement;
		fireEvent.keyDown(menu, { key: 'Escape' });
		expect(container.querySelector('.connect-menu')).toBeNull();
		expect(document.activeElement).toBe(outputPort);
	});

	it('wires a connection when a menu entry is selected from the keyboard', () => {
		const onAddConnectedNode = vi.fn();
		const { container } = render(GraphNodeViewDirectHarness, {
			props: { data: noiseNodeData, onAddConnectedNode }
		});

		const outputPort = container.querySelector('.port.out')!;
		fireEvent.keyDown(outputPort, { key: 'Enter' });

		const firstMatch = container.querySelector('.connect-menu button.item');
		expect(firstMatch).not.toBeNull();
		fireEvent.click(firstMatch!);

		expect(onAddConnectedNode).toHaveBeenCalledWith(
			expect.objectContaining({
				source: { node: 'n1', port: 'value' },
				sourceDirection: 'out',
				primitiveId: expect.any(String),
				position: expect.objectContaining({ x: expect.any(Number), y: expect.any(Number) })
			})
		);
		expect(container.querySelector('.connect-menu')).toBeNull();
	});
});
