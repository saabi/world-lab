<script module lang="ts">
	import type { DividerData } from './layout/runtime.js';

	interface Props {
		divider: DividerData;
		layoutTick: number;
		active?: boolean;
		onmousedown?: (event: MouseEvent) => void;
	}
</script>

<script lang="ts">
	let { divider, layoutTick, active = false, onmousedown }: Props = $props();

	const style = $derived.by(() => {
		layoutTick;
		const group = divider.parent;
		const x = group.getLeft();
		const y = group.getTop();
		const w = group.getWidth();
		const h = group.getHeight();
		const position = divider.position ?? 0;

		if (divider.type === 'horizontal') {
			return `left: ${x * 100}%; top: ${(y + position * h) * 100}%; width: ${w * 100}%; height: 0`;
		}

		return `top: ${y * 100}%; left: ${(x + position * w) * 100}%; width: 0; height: ${h * 100}%`;
	});

	const ariaValueNow = $derived(Math.round((divider.position ?? 0.5) * 100));

	const resizeLabel = $derived(
		divider.type === 'horizontal' ? 'Resize horizontal pane split' : 'Resize vertical pane split'
	);

	function handleMousedown(event: MouseEvent) {
		event.preventDefault();
		event.stopPropagation();
		onmousedown?.(event);
	}
</script>

<div
	class="divider {divider.type}"
	class:active={active}
	{style}
	role="slider"
	tabindex="0"
	aria-label={resizeLabel}
	aria-orientation={divider.type === 'horizontal' ? 'horizontal' : 'vertical'}
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={ariaValueNow}
	onmousedown={handleMousedown}
></div>

<style>
	.divider {
		position: absolute;
		z-index: 10;
		width: 0;
		height: 0;
		pointer-events: all;
	}

	.divider::after {
		content: '';
		position: absolute;
		left: calc(0px - var(--draggable));
		top: calc(0px - var(--draggable));
		width: calc(100% + var(--draggable) * 2);
		height: calc(100% + var(--draggable) * 2);
	}

	.horizontal {
		cursor: row-resize;
	}

	.vertical {
		cursor: col-resize;
	}

	.divider::before {
		content: '';
		position: absolute;
		background-color: var(--color);
		opacity: 0.72;
		transition:
			opacity 0.12s ease,
			background-color 0.12s ease,
			width 0.12s ease,
			height 0.12s ease,
			left 0.12s ease,
			top 0.12s ease;
	}

	/* Horizontal split: drag moves vertically — grow the bar on the Y axis only. */
	.horizontal::before {
		--visual-extra: 2px;
		left: calc(0px - var(--thickness) / 2);
		top: calc(0px - (var(--thickness) + var(--visual-extra)) / 2);
		width: calc(100% + var(--thickness));
		height: calc(var(--thickness) + var(--visual-extra));
	}

	/* Vertical split: drag moves horizontally — grow the bar on the X axis only. */
	.vertical::before {
		--visual-extra: 2px;
		left: calc(0px - (var(--thickness) + var(--visual-extra)) / 2);
		top: calc(0px - var(--thickness) / 2);
		width: calc(var(--thickness) + var(--visual-extra));
		height: calc(100% + var(--thickness));
	}

	.divider:hover::before,
	.divider:focus-visible::before {
		--visual-extra: 4px;
		opacity: 1;
	}

	.divider.active::before {
		--visual-extra: 4px;
		opacity: 1;
		background-color: var(--subdivide-menu-color, #4a6fa5);
	}
</style>
