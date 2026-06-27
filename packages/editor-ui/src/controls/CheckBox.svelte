<script lang="ts">
	interface Props {
		id?: string;
		label: string;
		checked: boolean;
		disabled?: boolean;
	}

	let { id, label, checked = $bindable(), disabled = false }: Props = $props();
	let inputId = $derived(id ?? label);
</script>

<li class="checkbox-row">
	<label class="checkbox-label" for={inputId}>{label}</label>
	<input class="checkbox-input" id={inputId} type="checkbox" bind:checked {disabled} />
</li>

<style>
	.checkbox-row {
		list-style: none;
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		margin: 4px 0;
		padding-right: 4px;
	}

	.checkbox-label {
		flex: 1;
		text-align: right;
		font-size: 12px;
	}

	.checkbox-input {
		flex: 0 0 auto;
		accent-color: #6b9fff;
	}
</style>
