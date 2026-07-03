import '@world-lab/graph';
import { fireEvent, render } from '@testing-library/svelte';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { defaultPreviewGraph } from './defaultGraph.js';
import GraphEditor from './GraphEditor.svelte';

function createStorageMock() {
	const store = new Map<string, string>();
	return {
		getItem: (key: string) => store.get(key) ?? null,
		setItem: (key: string, value: string) => store.set(key, value),
		removeItem: (key: string) => store.delete(key),
		clear: () => store.clear(),
		get length() {
			return store.size;
		},
		key: (index: number) => [...store.keys()][index] ?? null
	} satisfies Storage;
}

describe('GraphEditor toolbar reorg', () => {
	beforeEach(() => {
		vi.stubGlobal('localStorage', createStorageMock());
	});

	it('removes the redundant sidebar toggle from the header toolbar', () => {
		const { container } = render(GraphEditor, {
			props: { graph: defaultPreviewGraph() }
		});

		expect(container.querySelector('.sidebar-toggle')).toBeNull();
		expect(container.querySelector('.toolbar button[aria-pressed]')).toBeNull();
		expect(container.querySelector('.toolbar > button')).toBeNull();
	});

	it('shows a disabled selection delete control inside the canvas sidebar', async () => {
		const { container } = render(GraphEditor, {
			props: { graph: defaultPreviewGraph() }
		});

		const reveal = container.querySelector('.panel-reveal-tab--right');
		expect(reveal).not.toBeNull();
		await fireEvent.click(reveal!);

		const headings = [...container.querySelectorAll('.sidebar-panel h3')].map(
			(heading) => heading.textContent
		);
		expect(headings).toContain('Display');
		expect(headings).toContain('Selection');

		const deleteButton = container.querySelector(
			'[data-testid="canvas-selection-delete"]'
		) as HTMLButtonElement;
		expect(deleteButton).not.toBeNull();
		expect(deleteButton.disabled).toBe(true);
	});
});
