<script lang="ts">
	import type { PlanetParameters } from '../params/planetParams.js';
	import type { ParamEditorSection } from '../params/paramEditorSchema.js';
	import { SliderRow } from '@virtual-planet/editor-ui';

	let {
		section,
		params = $bindable()
	}: {
		section: ParamEditorSection;
		params: PlanetParameters;
	} = $props();
</script>

<details class="subsection" open={section.defaultOpen ?? false}>
	<summary>{section.title}</summary>
	<ul class="subsection-body">
		{#each section.sliders as slider (slider.key)}
			<SliderRow
				id={String(slider.key)}
				{slider}
				value={params[slider.key]}
				onvalue={(v) => (params[slider.key] = v)}
			/>
		{/each}
		{#each section.toggles ?? [] as toggle (toggle.key)}
			<li class="flag-row">
				<label class="flag-label" for={toggle.key}>{toggle.label}</label>
				<input
					id={toggle.key}
					class="flag-input"
					type="checkbox"
					checked={params[toggle.key] > 0.5}
					onchange={(e) => (params[toggle.key] = e.currentTarget.checked ? 1 : 0)}
				/>
			</li>
		{/each}
	</ul>
</details>

<style>
	.subsection {
		margin: 3px 0;
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		overflow: hidden;
	}

	.subsection > summary {
		list-style: none;
		cursor: pointer;
		user-select: none;
		padding: 3px 8px;
		background: rgba(92, 60, 0, 0.28);
		color: #e8dcc8;
		font-size: 11px;
		font-weight: 600;
		display: flex;
		align-items: center;
		gap: 5px;
	}

	.subsection > summary::-webkit-details-marker {
		display: none;
	}

	.subsection > summary::before {
		content: '▸';
		font-size: 9px;
		color: #c9a87a;
		transition: transform 0.12s ease;
	}

	.subsection[open] > summary::before {
		transform: rotate(90deg);
	}

	.subsection > summary:hover {
		background: rgba(120, 80, 0, 0.38);
	}

	.subsection-body {
		margin: 0;
		padding: 4px 4px 6px;
		list-style: none;
	}

	.flag-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 10px;
		margin: 4px 0;
		padding-right: 4px;
		list-style: none;
	}

	.flag-label {
		flex: 1;
		text-align: right;
		font-size: 12px;
	}

	.flag-input {
		accent-color: #6b9fff;
	}
</style>
