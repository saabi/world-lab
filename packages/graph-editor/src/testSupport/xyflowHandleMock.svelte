<script lang="ts">
	let { ...rest }: Record<string, unknown> = $props();
</script>

<div data-testid="handle-mock" {...rest}></div>
