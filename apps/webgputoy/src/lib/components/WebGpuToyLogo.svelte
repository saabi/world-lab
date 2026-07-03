<script module lang="ts">
	// ===== TYPES =====
	export type { WebGpuToyLogoTheme, WebGpuToyLogoVariant } from './webGpuToyLogo';

	interface Props {
		variant?: import('./webGpuToyLogo').WebGpuToyLogoVariant;
		theme?: import('./webGpuToyLogo').WebGpuToyLogoTheme;
		/** Logo height in rem; width follows the active variant aspect ratio. */
		size?: number;
		class?: string;
		/** When true, hide from assistive tech (e.g. inside a link with its own label). */
		decorative?: boolean;
	}
</script>

<script lang="ts">
	import {
		BRAND_COLORS,
		ISOTYPE_CURVES,
		ISOTYPE_RECTS,
		LOGO_LABEL,
		NAME_ACCENT_PATHS,
		NAME_PRIMARY_PATHS,
		NAME_W_POLYGON,
		resolveLogoThemeColors,
		viewBoxForVariant
	} from './webGpuToyLogo';

	let {
		variant = 'both',
		theme = 'light',
		size = 4,
		class: className = '',
		decorative = false
	}: Props = $props();

	const showIsotype = $derived(variant === 'isotype' || variant === 'both');
	const showName = $derived(variant === 'name' || variant === 'both');
	const viewBox = $derived(viewBoxForVariant(variant));
	const themeColors = $derived(resolveLogoThemeColors(theme));
	const aspectRatio = $derived(viewBox.width / viewBox.height);
	const ariaLabel = $derived(
		decorative
			? undefined
			: variant === 'isotype'
				? `${LOGO_LABEL} mark`
				: LOGO_LABEL
	);
</script>

<svg
	class={['webgpu-toy-logo', `webgpu-toy-logo--${theme}`, `webgpu-toy-logo--${variant}`, className]}
	data-theme={theme}
	data-variant={variant}
	viewBox="{viewBox.x} {viewBox.y} {viewBox.width} {viewBox.height}"
	fill-rule="evenodd"
	role={ariaLabel ? 'img' : undefined}
	aria-label={ariaLabel}
	aria-hidden={decorative ? true : undefined}
	style:height="{size}rem"
	style:width="calc({size}rem * {aspectRatio})"
>
	{#if !decorative}
		<title>{LOGO_LABEL}</title>
	{/if}

	{#if showIsotype}
		{#each ISOTYPE_RECTS as rect, index (index)}
			<rect
				x={rect.x}
				y={rect.y}
				width={rect.width}
				height={rect.height}
				rx={rect.rx}
				ry={rect.rx}
				fill={rect.fill}
			/>
		{/each}
		{#each ISOTYPE_CURVES as curve, index (index)}
			<path
				d={curve}
				fill="none"
				stroke={themeColors.curveStroke}
				stroke-width="8.33"
				stroke-miterlimit="2.61313"
			/>
		{/each}
	{/if}

	{#if showName}
		{#each NAME_PRIMARY_PATHS as path, index (index)}
			<path d={path} fill={themeColors.darkText} />
		{/each}
		<polygon points={NAME_W_POLYGON} fill={themeColors.darkText} />
		{#each NAME_ACCENT_PATHS as path, index (index)}
			<path d={path} fill={BRAND_COLORS.blue} />
		{/each}
	{/if}
</svg>

<style>
	.webgpu-toy-logo {
		display: block;
		flex-shrink: 0;
		shape-rendering: geometricPrecision;
		text-rendering: geometricPrecision;
	}
</style>
