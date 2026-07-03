<script lang="ts">
	import type { GraphDocument } from '@world-lab/graph';
	import {
		DEFAULT_MESH_PREVIEW_CAMERA,
		clampMeshPreviewPitch,
		renderMeshGenPreview,
		requestGpuDevice,
		type MeshGenRequest,
		type MeshPreviewCamera,
		type MeshPreviewRenderMode
	} from '@world-lab/runtime-webgpu';

	import type { MeshTargetDescriptor } from './previewBuffers.js';

	type RuntimePreviewInput = Parameters<typeof renderMeshGenPreview>[0];

	interface PreviewRenderCall extends RuntimePreviewInput {
		camera: MeshPreviewCamera;
		renderMode: MeshPreviewRenderMode;
	}

	interface DragState {
		pointerId: number;
		clientX: number;
		clientY: number;
	}

	interface Props {
		graph: GraphDocument;
		meshRequest: MeshTargetDescriptor | null;
		size?: number;
		refreshEpoch?: number;
		compileSignature?: string;
	}

	let {
		graph,
		meshRequest,
		size = 256,
		refreshEpoch = 0,
		compileSignature = ''
	}: Props = $props();

	const webGpuAvailable =
		typeof navigator !== 'undefined' && typeof navigator.gpu !== 'undefined';
	const ORBIT_SPEED = 0.01;
	const DOLLY_SPEED = 0.0015;
	const MIN_DISTANCE = 0.6;
	const MAX_DISTANCE = 12;

	let canvas = $state<HTMLCanvasElement | null>(null);
	let statusMessage = $state<string | null>(null);
	let wireframe = $state(false);
	let isDragging = $state(false);
	let cameraYaw = $state(DEFAULT_MESH_PREVIEW_CAMERA.yaw);
	let cameraPitch = $state(DEFAULT_MESH_PREVIEW_CAMERA.pitch);
	let cameraDistance = $state(DEFAULT_MESH_PREVIEW_CAMERA.distance);

	let dragState: DragState | null = null;
	const touchPoints = new Map<number, { x: number; y: number }>();
	let pinchDistance = 0;
	let gpuDevicePromise: Promise<{ device: GPUDevice }> | null = null;
	let previousGraph: GraphDocument | null = null;
	let previousMeshRequest: MeshTargetDescriptor | null = null;
	let previousRefreshEpoch = Number.NaN;
	let previousCompileSignature: string | null = null;

	function buildMeshGenRequest(descriptor: MeshTargetDescriptor): MeshGenRequest {
		return {
			graph,
			position: descriptor.position,
			normal: descriptor.normal,
			gridSize: descriptor.gridSize,
			faceCount: descriptor.faceCount
		};
	}

	function clamp(value: number, min: number, max: number): number {
		return Math.min(max, Math.max(min, value));
	}

	function touchSpan(): number {
		const points = [...touchPoints.values()];
		if (points.length < 2) return 0;
		const [a, b] = points;
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	function releaseDragState(): void {
		dragState = null;
		isDragging = false;
	}

	async function getGpuDevice(): Promise<GPUDevice> {
		gpuDevicePromise ??= requestGpuDevice();
		try {
			const { device } = await gpuDevicePromise;
			return device;
		} catch (error) {
			gpuDevicePromise = null;
			throw error;
		}
	}

	function handlePointerDown(event: PointerEvent): void {
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		const target = event.currentTarget as HTMLCanvasElement;
		target.focus();
		target.setPointerCapture(event.pointerId);

		if (event.pointerType === 'touch') {
			touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (touchPoints.size === 2) {
				releaseDragState();
				pinchDistance = touchSpan();
				return;
			}
		}

		dragState = {
			pointerId: event.pointerId,
			clientX: event.clientX,
			clientY: event.clientY
		};
		isDragging = true;
	}

	function handlePointerMove(event: PointerEvent): void {
		if (event.pointerType === 'touch' && touchPoints.has(event.pointerId)) {
			touchPoints.set(event.pointerId, { x: event.clientX, y: event.clientY });
			if (touchPoints.size === 2) {
				const nextSpan = touchSpan();
				if (pinchDistance > 0 && nextSpan > 0) {
					cameraDistance = clamp(
						cameraDistance * Math.exp(Math.log(pinchDistance / nextSpan)),
						MIN_DISTANCE,
						MAX_DISTANCE
					);
				}
				pinchDistance = nextSpan;
				return;
			}
		}

		if (!dragState || event.pointerId !== dragState.pointerId) return;
		const deltaX = event.clientX - dragState.clientX;
		const deltaY = event.clientY - dragState.clientY;
		dragState = {
			pointerId: event.pointerId,
			clientX: event.clientX,
			clientY: event.clientY
		};
		cameraYaw -= deltaX * ORBIT_SPEED;
		cameraPitch = clampMeshPreviewPitch(cameraPitch - deltaY * ORBIT_SPEED);
	}

	function handlePointerUp(event: PointerEvent): void {
		if (event.pointerType === 'touch') {
			touchPoints.delete(event.pointerId);
			if (touchPoints.size < 2) pinchDistance = 0;
		}
		if (!dragState || event.pointerId !== dragState.pointerId) return;
		releaseDragState();
	}

	function handleLostPointerCapture(event: PointerEvent): void {
		if (!dragState || event.pointerId !== dragState.pointerId) return;
		releaseDragState();
	}

	function handleWheel(event: WheelEvent): void {
		event.preventDefault();
		cameraDistance = clamp(
			cameraDistance * Math.exp(event.deltaY * DOLLY_SPEED),
			MIN_DISTANCE,
			MAX_DISTANCE
		);
	}

	let previewCamera = $derived.by(
		(): MeshPreviewCamera => ({
			yaw: cameraYaw,
			pitch: cameraPitch,
			distance: cameraDistance
		})
	);

	let renderMode = $derived<MeshPreviewRenderMode>(wireframe ? 'wireframe' : 'solid');

	$effect(() => {
		void refreshEpoch;
		void compileSignature;
		void meshRequest;
		void renderMode;
		void previewCamera;
		if (!canvas || !meshRequest) return;

		if (!webGpuAvailable) {
			statusMessage = 'WebGPU is not available in this browser.';
			return;
		}

		let cancelled = false;
		const showLoadingStatus =
			previousGraph !== graph ||
			previousMeshRequest !== meshRequest ||
			previousRefreshEpoch !== refreshEpoch ||
			previousCompileSignature !== compileSignature ||
			statusMessage !== null;

		previousGraph = graph;
		previousMeshRequest = meshRequest;
		previousRefreshEpoch = refreshEpoch;
		previousCompileSignature = compileSignature;
		const request = buildMeshGenRequest(meshRequest);
		const camera = previewCamera;
		const mode = renderMode;

		if (showLoadingStatus) {
			statusMessage = 'Rendering…';
		}

		void (async () => {
			try {
				const device = await getGpuDevice();
				if (cancelled) return;

				const previewInput: PreviewRenderCall = {
					device,
					canvas,
					request,
					camera,
					renderMode: mode
				};

				await renderMeshGenPreview(previewInput as RuntimePreviewInput);
				if (cancelled) return;
				statusMessage = null;
			} catch (error) {
				if (cancelled) return;
				statusMessage = error instanceof Error ? error.message : 'Mesh preview failed.';
			}
		})();

		return () => {
			cancelled = true;
		};
	});
</script>

<div class="preview">
	{#if !meshRequest}
		<p class="empty">Wire a mesh target — add target.mesh and connect position and normal fields.</p>
	{:else}
		<div class="toolbar">
			<label class="toggle">
				<input type="checkbox" bind:checked={wireframe} />
				<span>Wireframe</span>
			</label>
			<p class="hint">Drag to orbit. Scroll or pinch to zoom.</p>
		</div>
		<canvas
			bind:this={canvas}
			width={size}
			height={size}
			class={['mesh', isDragging && 'dragging']}
			aria-label="Mesh preview"
			tabindex="0"
			onpointerdown={handlePointerDown}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointercancel={handlePointerUp}
			onlostpointercapture={handleLostPointerCapture}
			onwheel={handleWheel}
		></canvas>
		{#if statusMessage}
			<p class="status" role="status">{statusMessage}</p>
		{/if}
	{/if}
</div>

<style>
	.preview {
		display: flex;
		flex-direction: column;
		gap: 10px;
		padding: 8px;
		height: 100%;
		align-items: stretch;
		justify-content: center;
	}

	.toolbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		flex-wrap: wrap;
	}

	.toggle {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
	}

	.hint {
		margin: 0;
		font-size: 11px;
		opacity: 0.7;
	}

	.mesh {
		width: min(100%, 256px);
		height: auto;
		border: 1px solid rgba(255, 255, 255, 0.12);
		align-self: center;
		cursor: grab;
		touch-action: none;
	}

	.mesh.dragging {
		cursor: grabbing;
	}

	.status,
	.empty {
		margin: 0;
		font-size: 11px;
		opacity: 0.7;
		text-align: center;
	}

	.empty {
		padding: 12px;
		align-self: stretch;
	}

	.status {
		align-self: center;
	}
</style>
