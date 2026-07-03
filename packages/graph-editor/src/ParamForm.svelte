<script lang="ts">
	import { fields, sectionsOf, check, type TSchema } from '@world-lab/schema';

	interface Props {
		schema: TSchema;
		value: Record<string, unknown>;
		drivenBy?: Readonly<Record<string, string>>;
		onchange?: (next: Record<string, unknown>) => void;
	}

	let { schema, value, drivenBy = {}, onchange }: Props = $props();

	const fieldList = $derived(fields(schema));
	const sectionList = $derived(sectionsOf(schema));

	function set(key: string, v: unknown) {
		const next = { ...value, [key]: v };
		if (!check(schema, next)) return;
		onchange?.(next);
	}

	function unitSuffix(unit: string | undefined): string {
		return unit && unit !== 'none' ? ` (${unit})` : '';
	}
</script>

<div class="param-form">
	{#if sectionList.length > 0}
		{#each sectionList as section (section.id)}
			<details class="section" open={!section.collapsed}>
				<summary>{section.label ?? section.id}</summary>
				{#each fieldList.filter((field) => field.annotations.section === section.id) as field (field.key)}
					{@render fieldRow(field)}
				{/each}
			</details>
		{/each}
		{#each fieldList.filter((field) => !field.annotations.section) as field (field.key)}
			{@render fieldRow(field)}
		{/each}
	{:else}
		{#each fieldList as field (field.key)}
			{@render fieldRow(field)}
		{/each}
	{/if}
	{#if fieldList.length === 0}
		<p class="empty">No parameters.</p>
	{/if}
</div>

{#snippet fieldRow(field: (typeof fieldList)[number])}
	{@const driven = drivenBy[field.key]}
	<label class="field" class:driven={!!driven}>
		<span class="field-label">{field.key}{unitSuffix(field.annotations.unit)}</span>
		{#if driven}
			<span class="driven-label">driven by {driven}</span>
		{:else if field.kind === 'boolean'}
			<input
				type="checkbox"
				checked={!!value[field.key]}
				onchange={(event) => set(field.key, event.currentTarget.checked)}
			/>
		{:else if field.kind === 'enum'}
			<select
				class="field-input"
				value={String(value[field.key] ?? field.annotations.default ?? '')}
				onchange={(event) =>
					set(
						field.key,
						(field.options ?? []).find((option) => String(option) === event.currentTarget.value)
					)}
			>
				{#each field.options ?? [] as option (option)}
					<option value={String(option)}>{option}</option>
				{/each}
			</select>
		{:else if field.kind === 'number' || field.kind === 'integer'}
			{@const scale = field.annotations.scale ?? 1}
			<input
				class="field-input"
				type="number"
				value={Number(value[field.key] ?? field.annotations.default ?? 0) / scale}
				min={field.annotations.extent?.[0] != null ? field.annotations.extent[0] / scale : undefined}
				max={field.annotations.extent?.[1] != null ? field.annotations.extent[1] / scale : undefined}
				step={field.kind === 'integer' ? 1 : 'any'}
				onchange={(event) => set(field.key, Number(event.currentTarget.value) * scale)}
			/>
		{:else}
			<input
				class="field-input"
				type="text"
				value={String(value[field.key] ?? field.annotations.default ?? '')}
				onchange={(event) => set(field.key, event.currentTarget.value)}
			/>
		{/if}
	</label>
{/snippet}

<style>
	.param-form {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.section {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.section summary {
		cursor: pointer;
		font-size: 11px;
		font-weight: 600;
		opacity: 0.8;
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

	.field.driven {
		opacity: 0.75;
	}

	.driven-label {
		flex: 0 0 52%;
		min-width: 0;
		font-size: 11px;
		font-style: italic;
		opacity: 0.8;
	}

	.empty {
		margin: 0;
		font-size: 11px;
		opacity: 0.55;
	}
</style>
