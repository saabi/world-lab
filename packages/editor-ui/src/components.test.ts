import { fireEvent, render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import SectionHarness from './test/SectionHarness.svelte';
import SliderRowHarness from './test/SliderRowHarness.svelte';
import CheckBoxHarness from './test/CheckBoxHarness.svelte';

describe('Section', () => {
	it('collapses and expands body content', async () => {
		const user = userEvent.setup();
		render(SectionHarness);

		expect(screen.getByTestId('section-body')).toBeTruthy();
		await user.click(screen.getByRole('button', { name: /test/i }));
		expect(screen.queryByTestId('section-body')).toBeNull();
		await user.click(screen.getByRole('button', { name: /test/i }));
		expect(screen.getByTestId('section-body')).toBeTruthy();
	});
});

describe('SliderRow', () => {
	it('emits onvalue and shows numeric readout', async () => {
		render(SliderRowHarness);

		const slider = screen.getByRole('slider', { name: /gain/i }) as HTMLInputElement;
		expect(screen.getByText('0.5')).toBeTruthy();

		await fireEvent.input(slider, { target: { value: '0.8' } });
		expect(screen.getByText('0.8')).toBeTruthy();
	});
});

describe('CheckBox', () => {
	it('toggles checked state', async () => {
		const user = userEvent.setup();
		render(CheckBoxHarness);

		const box = screen.getByRole('checkbox', { name: /enabled/i }) as HTMLInputElement;
		expect(box.checked).toBe(false);
		await user.click(box);
		expect(box.checked).toBe(true);
		await user.click(box);
		expect(box.checked).toBe(false);
	});
});
