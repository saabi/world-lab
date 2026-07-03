<script lang="ts">
	import { focusTrap } from './focusTrap.js';

	interface Props {
		open?: boolean;
	}

	let { open = true }: Props = $props();
</script>

<button type="button" data-testid="trigger">Trigger</button>
{#if open}
	<div data-testid="trap" use:focusTrap>
		<button type="button" data-testid="first">First</button>
		<button type="button" data-testid="middle">Middle</button>
		<button type="button" data-testid="last">Last</button>
	</div>
{/if}
