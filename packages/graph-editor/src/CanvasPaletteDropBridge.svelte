<script lang="ts">
	import { onMount } from 'svelte';
	import { useSvelteFlow } from '@xyflow/svelte';

	import { hasPaletteDrag, readPalettePrimitiveId } from './paletteDrag.js';

	interface Props {
		ondrop?: (primitiveId: string, position: { x: number; y: number }) => void;
	}

	let { ondrop: onPaletteDrop }: Props = $props();

	const { screenToFlowPosition } = useSvelteFlow();

	onMount(() => {
		const pane = document.querySelector('.svelte-flow__pane');
		if (!pane) return;

		const onDragOver = (event: DragEvent) => {
			if (!hasPaletteDrag(event.dataTransfer)) return;
			event.preventDefault();
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
		};

		const onDrop = (event: DragEvent) => {
			const primitiveId = readPalettePrimitiveId(event.dataTransfer);
			if (!primitiveId) return;
			event.preventDefault();
			event.stopPropagation();
			const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
			onPaletteDrop?.(primitiveId, position);
		};

		pane.addEventListener('dragover', onDragOver);
		pane.addEventListener('drop', onDrop);
		return () => {
			pane.removeEventListener('dragover', onDragOver);
			pane.removeEventListener('drop', onDrop);
		};
	});
</script>
