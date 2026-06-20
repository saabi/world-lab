<script lang="ts">
	import { fields, type TSchema } from '@virtual-planet/schema';

	interface Props {
		schema: TSchema;
		value: Record<string, unknown>;
		onchange?: (next: Record<string, unknown>) => void;
	}

	let { schema, value, onchange }: Props = $props();

	const fieldList = $derived(fields(schema));

	function set(key: string, v: unknown) {
		onchange?.({ ...value, [key]: v });
	}

	function unitSuffix(unit: string | undefined): string {
		return unit && unit !== 'none' ? ` (${unit})` : '';
	}
</script>

<div class="schema-form">
	{#each fieldList as f (f.key)}
		<label class="field">
			<span class="field-label">{f.key}{unitSuffix(f.annotations.unit)}</span>
			{#if f.kind === 'boolean'}
				<input
					type="checkbox"
					checked={!!value[f.key]}
					onchange={(e) => set(f.key, e.currentTarget.checked)}
				/>
			{:else if f.kind === 'enum'}
				<select
					class="field-input"
					value={String(value[f.key] ?? f.annotations.default ?? '')}
					onchange={(e) =>
						set(f.key, (f.options ?? []).find((o) => String(o) === e.currentTarget.value))}
				>
					{#each f.options ?? [] as opt (opt)}
						<option value={String(opt)}>{opt}</option>
					{/each}
				</select>
			{:else if f.kind === 'number' || f.kind === 'integer'}
				{@const scale = f.annotations.scale ?? 1}
				<input
					class="field-input"
					type="number"
					value={Number(value[f.key] ?? f.annotations.default ?? 0) / scale}
					min={f.annotations.extent?.[0] != null ? f.annotations.extent[0] / scale : undefined}
					max={f.annotations.extent?.[1] != null ? f.annotations.extent[1] / scale : undefined}
					step={f.kind === 'integer' ? 1 : 'any'}
					onchange={(e) => set(f.key, Number(e.currentTarget.value) * scale)}
				/>
			{:else}
				<input
					class="field-input"
					type="text"
					value={String(value[f.key] ?? f.annotations.default ?? '')}
					onchange={(e) => set(f.key, e.currentTarget.value)}
				/>
			{/if}
		</label>
	{/each}
	{#if fieldList.length === 0}
		<p class="empty">No editable fields.</p>
	{/if}
</div>

<style>
	.schema-form {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.field {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12px;
	}

	.field-label {
		flex: 1;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.field-input {
		flex: 0 0 52%;
		min-width: 0;
		background: #1a1f30;
		color: inherit;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 4px;
		padding: 2px 4px;
	}

	.empty {
		margin: 0;
		font-size: 11px;
		opacity: 0.55;
	}
</style>
