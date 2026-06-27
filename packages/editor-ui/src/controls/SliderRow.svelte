<script lang="ts">
	import Range from './Range.svelte';
	import LogRange from './LogRange.svelte';

	interface SliderDef {
		label: string;
		min: number;
		max: number;
		step?: number;
		log?: boolean;
	}

	interface Props {
		id?: string;
		slider: SliderDef;
		value: number;
		onvalue: (v: number) => void;
		variant?: 'default' | 'scene';
		disabled?: boolean;
	}

	let { id, slider, value, onvalue, variant = 'default', disabled = false }: Props = $props();
</script>

{#if slider.log}
	<LogRange
		{id}
		label={slider.label}
		min={slider.min}
		max={slider.max}
		{value}
		{onvalue}
		{variant}
		{disabled}
	/>
{:else}
	<Range
		{id}
		label={slider.label}
		min={slider.min}
		max={slider.max}
		step={slider.step ?? 0.01}
		{value}
		{onvalue}
		{variant}
		{disabled}
	/>
{/if}
