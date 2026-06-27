<script lang="ts">
	import CheckBox from '../controls/CheckBox.svelte';

	let checked = $state(false);
</script>

<ul>
	<CheckBox id="enabled" label="Enabled" bind:checked />
</ul>
