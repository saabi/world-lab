import { describe, expect, it } from 'vitest';
import type { GraphDocument } from '@world-lab/graph';
import { createGraphHistory } from './history.svelte.js';

function doc(version: string): GraphDocument {
	return { version, nodes: [], edges: [] } as unknown as GraphDocument;
}

describe('createGraphHistory', () => {
	it('starts empty', () => {
		const history = createGraphHistory();
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
		expect(history.undoLabel).toBeNull();
		expect(history.redoLabel).toBeNull();
	});

	it('captures a previous doc and label, then undoes back to it', () => {
		const history = createGraphHistory();
		const a = doc('a');
		const b = doc('b');

		history.capture(a, 'Add node');
		expect(history.canUndo).toBe(true);
		expect(history.undoLabel).toBe('Add node');

		const restored = history.undo(b);
		expect(restored).toBe(a);
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(true);
		expect(history.redoLabel).toBe('Add node');
	});

	it('redoes back to the state undo moved away from', () => {
		const history = createGraphHistory();
		const a = doc('a');
		const b = doc('b');

		history.capture(a, 'Add node');
		history.undo(b);

		const redone = history.redo(a);
		expect(redone).toBe(b);
		expect(history.canUndo).toBe(true);
		expect(history.canRedo).toBe(false);
	});

	it('clears the redo stack when a new edit is captured after an undo', () => {
		const history = createGraphHistory();
		const a = doc('a');
		const b = doc('b');
		const c = doc('c');

		history.capture(a, 'Add node');
		history.undo(b);
		expect(history.canRedo).toBe(true);

		history.capture(b, 'Delete node');
		expect(history.canRedo).toBe(false);
		expect(history.undoLabel).toBe('Delete node');

		const restored = history.undo(c);
		expect(restored).toBe(b);
	});

	it('undo/redo on an empty stack return null without side effects', () => {
		const history = createGraphHistory();
		expect(history.undo(doc('a'))).toBeNull();
		expect(history.redo(doc('a'))).toBeNull();
	});

	it('reset clears both stacks', () => {
		const history = createGraphHistory();
		history.capture(doc('a'), 'Add node');
		history.undo(doc('b'));
		expect(history.canRedo).toBe(true);

		history.reset();
		expect(history.canUndo).toBe(false);
		expect(history.canRedo).toBe(false);
	});

	it('supports multiple undo steps in order (LIFO)', () => {
		const history = createGraphHistory();
		const a = doc('a');
		const b = doc('b');
		const c = doc('c');

		history.capture(a, 'Add node');
		history.capture(b, 'Add edge');

		expect(history.undoLabel).toBe('Add edge');
		const step1 = history.undo(c);
		expect(step1).toBe(b);
		expect(history.undoLabel).toBe('Add node');
		const step2 = history.undo(step1!);
		expect(step2).toBe(a);
		expect(history.canUndo).toBe(false);
	});
});
