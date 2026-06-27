<script lang="ts">
	import { mapLogSlider, unmapLogSlider } from './logSlider.js';

	interface Props {
		id?: string;
		label: string;
		value: number;
		min: number;
		max: number;
		disabled?: boolean;
		variant?: 'default' | 'scene';
		onvalue?: (v: number) => void;
	}

	let {
		id,
		label,
		value = $bindable(),
		min,
		max,
		disabled = false,
		variant = 'default',
		onvalue
	}: Props = $props();
	let inputId = $derived(id ?? label);

	let sliderT = $state(0);

	$effect(() => {
		sliderT = unmapLogSlider(value, min, max);
	});

	function onSliderInput(e: Event) {
		const t = Number((e.currentTarget as HTMLInputElement).value);
		const v = mapLogSlider(t, min, max);
		value = v;
		onvalue?.(v);
	}

	/** 3 significant figures with adaptive units (m → km → Mm → Gm). */
	function formatMeters(n: number): string {
		if (!Number.isFinite(n)) return '—';
		const sig = (x: number) => Number(x.toPrecision(3));
		const abs = Math.abs(n);
		if (abs >= 1e9) return `${sig(n / 1e9)} Gm`;
		if (abs >= 1e6) return `${sig(n / 1e6)} Mm`;
		if (abs >= 1e3) return `${sig(n / 1e3)} km`;
		return `${sig(n)} m`;
	}

	let formattedValue = $derived(formatMeters(value));
</script>

<li class="range-row" class:scene={variant === 'scene'}>
	<label class="range-label" for={inputId}>{label}</label>
	<input
		class="range-input"
		id={inputId}
		type="range"
		min={0}
		max={1}
		step={0.001}
		{disabled}
		value={sliderT}
		oninput={onSliderInput}
	/>
	<data class="range-value" class:scene={variant === 'scene'}>{formattedValue}</data>
</li>

<style>
	.range-row {
		list-style: none;
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 2px 0;
	}

	.range-label {
		flex: 0 0 5em;
		text-align: right;
		font-size: 12px;
	}

	.range-value {
		flex: 0 0 4.5em;
		text-align: right;
		font-variant-numeric: tabular-nums;
		font-size: 12px;
		color: #9ecfff;
		background: rgba(26, 31, 48, 0.9);
		padding: 0 0.4em;
		border-radius: 3px;
	}

	.range-value.scene {
		color: #c7a6ff;
	}

	.range-input {
		flex: 1;
		min-width: 0;
		max-width: 140px;
		-webkit-appearance: none;
		appearance: none;
		background: transparent;
	}

	.range-row.scene .range-input {
		max-width: none;
	}

	.range-input:focus {
		outline: none;
	}

	.range-input::-webkit-slider-runnable-track {
		-webkit-appearance: none;
		appearance: none;
		height: 4px;
		cursor: pointer;
		background: #3a4258;
		border-radius: 4px;
	}

	.range-input::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		margin-top: -4px;
		width: 10px;
		height: 12px;
		border-radius: 4px;
		background: #c8d4f0;
		border: 1px solid rgba(255, 255, 255, 0.2);
		cursor: ew-resize;
	}

	.range-input:focus::-webkit-slider-runnable-track {
		background: #4a5878;
	}

	.range-input::-moz-range-track {
		height: 4px;
		cursor: pointer;
		background: #3a4258;
		border-radius: 4px;
	}

	.range-input::-moz-range-thumb {
		width: 10px;
		height: 12px;
		border-radius: 4px;
		background: #c8d4f0;
		border: 1px solid rgba(255, 255, 255, 0.2);
		cursor: ew-resize;
	}
</style>
