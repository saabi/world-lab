<script lang="ts">
	interface Props {
		id?: string;
		label: string;
		value: number;
		min: number | string;
		max: number | string;
		step: number | string;
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
		step,
		disabled = false,
		variant = 'default',
		onvalue
	}: Props = $props();
	let inputId = $derived(id ?? label);

	/** Round to 3 significant figures for display (drops float noise like 3.82000003). */
	function format(n: number): number {
		if (!Number.isFinite(n)) return 0;
		if (n === 0) return 0;
		return Number(n.toPrecision(3));
	}

	let formattedValue = $derived(format(value));

	function onInput(e: Event) {
		const v = Number((e.currentTarget as HTMLInputElement).value);
		value = v;
		onvalue?.(v);
	}
</script>

<li class="range-row" class:scene={variant === 'scene'}>
	<label class="range-label" for={inputId}>{label}</label>
	<input
		class="range-input"
		id={inputId}
		type="range"
		{min}
		{max}
		{step}
		{disabled}
		{value}
		oninput={onInput}
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
		flex: 0 0 3.5em;
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
