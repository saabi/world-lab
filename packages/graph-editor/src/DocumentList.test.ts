import { render } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import DocumentList from './DocumentList.svelte';

const actions = {
	onNew: vi.fn(),
	onSave: vi.fn(),
	onSaveAs: vi.fn(),
	onLoadSaved: vi.fn(),
	onLoadSample: vi.fn(),
	onRename: vi.fn(),
	onDelete: vi.fn(),
	onDownload: vi.fn(),
	onUpload: vi.fn(),
	onLoadLayoutChange: vi.fn()
};

describe('DocumentList toolbar grouping', () => {
	it('renders undo/redo after the file-action cluster, not before New/Save', () => {
		const { container } = render(DocumentList, {
			props: {
				actions,
				canUndo: true,
				canRedo: true,
				onUndo: vi.fn(),
				onRedo: vi.fn()
			}
		});

		const bar = container.querySelector('.document-bar')!;
		const switcher = bar.querySelector('.switcher-wrap');
		const actionRow = bar.querySelector('.actions');
		expect(switcher).not.toBeNull();
		expect(actionRow).not.toBeNull();
		expect(switcher!.compareDocumentPosition(actionRow!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

		const children = [...actionRow!.children];
		const newIndex = children.findIndex(
			(element) => element.tagName === 'BUTTON' && element.textContent === 'New'
		);
		const moreIndex = children.findIndex((element) => element.classList.contains('more'));
		const undoIndex = children.findIndex((element) =>
			element.matches('button[aria-label="Undo"]')
		);
		expect(newIndex).toBeGreaterThanOrEqual(0);
		expect(moreIndex).toBeGreaterThan(newIndex);
		expect(undoIndex).toBeGreaterThan(moreIndex);
	});
});
