<script lang="ts">
	import SliderRow from '../controls/SliderRow.svelte';

	let value = $state(0.5);
</script>

<ul>
	<SliderRow
		id="gain"
		slider={{ label: 'Gain', min: 0, max: 1, step: 0.1 }}
		{value}
		onvalue={(v) => (value = v)}
	/>
</ul>
