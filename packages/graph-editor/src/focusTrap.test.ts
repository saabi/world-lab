import { fireEvent, render } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';

import FocusTrapHarness from './FocusTrapHarness.svelte';

describe('focusTrap', () => {
	it('moves focus to the first focusable child on mount', async () => {
		const { getByTestId } = render(FocusTrapHarness, { props: { open: true } });
		await Promise.resolve();
		expect(document.activeElement).toBe(getByTestId('first'));
	});

	it('wraps Tab from the last focusable to the first', async () => {
		const { getByTestId } = render(FocusTrapHarness, { props: { open: true } });
		await Promise.resolve();
		getByTestId('last').focus();
		fireEvent.keyDown(getByTestId('trap'), { key: 'Tab' });
		expect(document.activeElement).toBe(getByTestId('first'));
	});

	it('wraps Shift+Tab from the first focusable to the last', async () => {
		const { getByTestId } = render(FocusTrapHarness, { props: { open: true } });
		await Promise.resolve();
		getByTestId('first').focus();
		fireEvent.keyDown(getByTestId('trap'), { key: 'Tab', shiftKey: true });
		expect(document.activeElement).toBe(getByTestId('last'));
	});

	it('restores focus to the previously focused element on unmount', async () => {
		const { getByTestId, rerender } = render(FocusTrapHarness, { props: { open: false } });
		const trigger = getByTestId('trigger');
		trigger.focus();
		expect(document.activeElement).toBe(trigger);

		await rerender({ open: true });
		await Promise.resolve();
		expect(document.activeElement).toBe(getByTestId('first'));

		await rerender({ open: false });
		expect(document.activeElement).toBe(trigger);
	});
});
