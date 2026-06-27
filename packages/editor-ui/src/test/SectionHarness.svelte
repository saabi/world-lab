<script lang="ts">
	import Section from '../Section.svelte';

	let open = $state(true);
</script>

<Section title="Test" {open} onToggle={() => (open = !open)}>
	{#snippet children()}
		<p data-testid="section-body">inside</p>
	{/snippet}
</Section>
