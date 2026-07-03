import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';

import Divider from './Divider.svelte';
import FloatingPanelHarness from './FloatingPanelHarness.svelte';
import { buildRuntimeTree } from './layout/build.js';
import type { LayoutDocument } from './layout/types.js';

function twoPaneLayout(): LayoutDocument {
	return {
		root: {
			type: 'group',
			row: true,
			pos: 0,
			size: 1,
			children: [
				{ type: 'pane', id: 'left', zone: 'main', pos: 0, size: 0.5 },
				{ type: 'pane', id: 'right', zone: 'main', pos: 0.5, size: 0.5 }
			]
		}
	};
}

describe('@world-lab/subdivide Divider', () => {
	it('adds the active class while dragging', () => {
		const { dividers } = buildRuntimeTree(twoPaneLayout());
		render(Divider, { divider: dividers[0]!, layoutTick: 0, active: true });
		expect(screen.getByRole('slider').classList.contains('active')).toBe(true);
	});

	it('omits the active class when not dragging', () => {
		const { dividers } = buildRuntimeTree(twoPaneLayout());
		render(Divider, { divider: dividers[0]!, layoutTick: 0, active: false });
		expect(screen.getByRole('slider').classList.contains('active')).toBe(false);
	});
});

describe('@world-lab/subdivide floating panels', () => {
	it('renders panel content when open and its zone matches the hosting pane', () => {
		render(FloatingPanelHarness, { open: true, panelZone: 'main' });
		expect(screen.getByTestId('sidebar-content')).toBeTruthy();
	});

	it('does not render panel content when closed', () => {
		render(FloatingPanelHarness, { open: false, panelZone: 'main' });
		expect(screen.queryByTestId('sidebar-content')).toBeNull();
	});

	it('does not render when open but no pane hosts the panel\'s zone', () => {
		render(FloatingPanelHarness, { open: true, panelZone: 'other' });
		expect(screen.queryByTestId('sidebar-content')).toBeNull();
	});

	it('does not affect the main pane content either way', () => {
		render(FloatingPanelHarness, { open: true, panelZone: 'main' });
		expect(screen.getByTestId('main-content')).toBeTruthy();
	});

	it('renders the panel inside the hosting pane, not at the Subdivide root', () => {
		render(FloatingPanelHarness, { open: true, panelZone: 'main' });
		const panel = screen.getByTestId('sidebar-content').closest('.floating-panel');
		const paneInner = screen.getByTestId('main-content').closest('.inner');
		expect(panel).not.toBeNull();
		expect(paneInner).not.toBeNull();
		expect(paneInner?.contains(panel)).toBe(true);
	});

	it('applies a side-specific class', () => {
		render(FloatingPanelHarness, { open: true, side: 'left', panelZone: 'main' });
		const panel = screen.getByTestId('sidebar-content').parentElement;
		expect(panel?.className).toContain('floating-panel--left');
	});

	it('does not stretch by default (fits content, not full pane size)', () => {
		render(FloatingPanelHarness, { open: true, panelZone: 'main' });
		const panel = screen.getByTestId('sidebar-content').parentElement;
		expect(panel?.className).not.toContain('floating-panel--stretch');
	});

	it('stretches to fill the cross axis when stretch is set', () => {
		render(FloatingPanelHarness, { open: true, panelZone: 'main', stretch: true });
		const panel = screen.getByTestId('sidebar-content').parentElement;
		expect(panel?.className).toContain('floating-panel--stretch');
	});

	it('toggles the panel for its zone when N is pressed while hovering the hosting pane', async () => {
		const onfloatingpaneltoggle = vi.fn();
		render(FloatingPanelHarness, { open: false, panelZone: 'main', onfloatingpaneltoggle });

		const inner = screen.getByTestId('main-content').closest('.inner')!;
		await fireEvent.mouseEnter(inner);
		await fireEvent.keyDown(window, { key: 'n' });

		expect(onfloatingpaneltoggle).toHaveBeenCalledExactlyOnceWith('sidebar');
	});

	it('does not toggle when N is pressed without hovering any pane', async () => {
		const onfloatingpaneltoggle = vi.fn();
		render(FloatingPanelHarness, { open: false, panelZone: 'main', onfloatingpaneltoggle });

		await fireEvent.keyDown(window, { key: 'n' });

		expect(onfloatingpaneltoggle).not.toHaveBeenCalled();
	});

	it('stops responding to N after the mouse leaves the pane', async () => {
		const onfloatingpaneltoggle = vi.fn();
		render(FloatingPanelHarness, { open: false, panelZone: 'main', onfloatingpaneltoggle });

		const inner = screen.getByTestId('main-content').closest('.inner')!;
		await fireEvent.mouseEnter(inner);
		await fireEvent.mouseLeave(inner);
		await fireEvent.keyDown(window, { key: 'n' });

		expect(onfloatingpaneltoggle).not.toHaveBeenCalled();
	});

	it('shows a reveal tab at the docking edge when the panel is closed', () => {
		render(FloatingPanelHarness, { open: false, side: 'right', panelZone: 'main' });
		const tab = screen.getByRole('button', { name: /show panel/i });
		expect(tab.className).toContain('panel-reveal-tab--right');
	});

	it('does not show a reveal tab when the panel is open', () => {
		render(FloatingPanelHarness, { open: true, panelZone: 'main' });
		expect(screen.queryByRole('button', { name: /show panel/i })).toBeNull();
	});

	it('clicking the reveal tab toggles the panel', async () => {
		const onfloatingpaneltoggle = vi.fn();
		render(FloatingPanelHarness, { open: false, panelZone: 'main', onfloatingpaneltoggle });

		const tab = screen.getByRole('button', { name: /show panel/i });
		await fireEvent.click(tab);

		expect(onfloatingpaneltoggle).toHaveBeenCalledExactlyOnceWith('sidebar');
	});

	it('shows the zone label as a pane title when one is configured', () => {
		render(FloatingPanelHarness, { panelZone: 'main', zoneLabels: { main: 'Main' } });
		const inner = screen.getByTestId('main-content').closest('.inner')!;
		expect(inner.querySelector('.pane-title')?.textContent).toBe('Main');
	});

	it('renders no title text when the zone has no configured label', () => {
		render(FloatingPanelHarness, { panelZone: 'main', zoneLabels: {} });
		const inner = screen.getByTestId('main-content').closest('.inner')!;
		expect(inner.querySelector('.pane-title')).toBeNull();
	});

	it('always shows the pane-type menu trigger, with or without a title', () => {
		render(FloatingPanelHarness, { panelZone: 'main', zoneLabels: {} });
		expect(screen.getByRole('button', { name: /change pane type/i })).toBeTruthy();
	});
});
