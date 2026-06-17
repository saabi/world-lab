<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { BufferGeometry } from 'three';

	import Range from './controls/Range.svelte';
	import CheckBox from './controls/CheckBox.svelte';
	import ThreeView from './ThreeView.svelte';

	import planetVertexShader from '../shaders/planet.vert';
	import planetFragmentShader from '../shaders/planet.frag';
	import { planet_configs } from '../planet-editor/sample-planets.js';

	type PlanetConfig = (typeof planet_configs)[keyof typeof planet_configs];

	let camera = $state<THREE.PerspectiveCamera | undefined>();
	let scene = $state<THREE.Scene | undefined>();
	let update = $state<((time: number) => void) | undefined>();
	let run = $state(true);

	let selection = $state<keyof typeof planet_configs>('normie');
	let angle = $state(Math.PI / 2);
	let wireframe = $state(false);
	let multisampling = $state(true);
	let fragSampling = $state(true);
	let illumination = $state(true);
	let render_water = $state(true);
	let normals = $state(false);
	let smoothShading = $state(false);
	const maxres = 96;
	let resx = $state(20);
	let resy = $state(10);
	const patchres = 16;

	let config = $state<PlanetConfig>({ ...planet_configs.normie });

	let controls: OrbitControls | undefined;
	let canvasEl: HTMLCanvasElement | undefined;
	let geometry: THREE.InstancedBufferGeometry | undefined;
	let material: THREE.RawShaderMaterial | undefined;
	let mesh: THREE.Mesh | undefined;

	$effect(() => {
		config = { ...planet_configs[selection] };
	});

	function initControls() {
		if (!canvasEl || !camera || controls) return;
		controls = new OrbitControls(camera, canvasEl);
		controls.screenSpacePanning = true;
		controls.target = new THREE.Vector3(0, 0, 0);
		camera.position.z = 300;
		camera.position.y = 0;
		controls.update();
	}

	function onCanvas(canvas: HTMLCanvasElement) {
		canvasEl = canvas;
		initControls();
	}

	onMount(() => {
		camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
		initControls();

		scene = new THREE.Scene();

		const planeGeom = new THREE.PlaneGeometry(1, 1, patchres, patchres);
		geometry = new THREE.InstancedBufferGeometry();
		BufferGeometry.prototype.copy.call(geometry, planeGeom);
		geometry.instanceCount = maxres * maxres;
		planeGeom.dispose();

		const indexes = new THREE.InstancedBufferAttribute(new Float32Array(maxres * maxres), 1);
		for (let i = 0; i < indexes.count; i++) {
			indexes.setX(i, i);
		}
		geometry.setAttribute('aIdx', indexes);

		material = new THREE.RawShaderMaterial({
			vertexShader: planetVertexShader,
			fragmentShader: planetFragmentShader,
			uniforms: {
				modelViewMatrix: { value: new THREE.Matrix4() },
				projectionMatrix: { value: new THREE.Matrix4() },
				viewMatrix: { value: new THREE.Matrix4() },
				normalMatrix: { value: new THREE.Matrix3() },
				cameraPosition: { value: new THREE.Vector3() },
				time: { value: 1.0 },
				angle: { value: Math.PI / 2 },
				radius: { value: 100 },
				variation: { value: 10 },
				voronoi_scale: { value: 1 },
				voronoi_amplitude: { value: 28 },
				voronoi_albedo: { value: 0.5 },
				voronoi_albedo_y: { value: 1 },
				voronoi_albedo_z: { value: 1 },
				voronoi_distortion_scale: { value: 2 },
				voronoi_distortion_amplitude: { value: 4 },
				voronoi_distortion_albedo: { value: 0.5 },
				detail_scale: { value: 40 },
				detail_amplitude: { value: 1 },
				detail_albedo: { value: 0.5 },
				water_level: { value: 0.5 },
				render_water: { value: 1.0 },
				erosion: { value: 1.56 },
				sand_cutoff: { value: 0.12 },
				vegetation_level: { value: 0.03 },
				snow_cover: { value: 0.1 },
				texture_noise_scale: { value: 1.5 },
				texture_noise_amplitude: { value: 3.0 },
				polar_scale: { value: 0.3 },
				polar_amplitude: { value: 8.5 },
				illumination: { value: 1.0 },
				multisampling: { value: 1.0 },
				fragSampling: { value: 1.0 },
				normals: { value: 0.0 },
				smoothShading: { value: 1.0 },
				ares: { value: [resx, resy, patchres] },
				inverseModelMatrix: { value: new THREE.Matrix4() }
			}
		});

		mesh = new THREE.Mesh(geometry, material);
		scene.add(mesh);

		update = (time: number) => {
			controls?.update();

			if (!material || !geometry || !mesh) return;

			for (const k in config) {
				const key = k as keyof PlanetConfig;
				if (material.uniforms[key]) {
					material.uniforms[key].value = config[key];
				}
			}

			geometry.instanceCount = resx * resy;

			material.wireframe = wireframe;
			material.uniforms.render_water.value = render_water ? 1.0 : 0.0;
			material.uniforms.illumination.value = illumination ? 1.0 : 0.0;
			material.uniforms.multisampling.value = multisampling ? 1.0 : 0.0;
			material.uniforms.fragSampling.value = fragSampling ? 1.0 : 0.0;
			material.uniforms.normals.value = normals ? 1.0 : 0.0;
			material.uniforms.smoothShading.value = smoothShading ? 1.0 : 0.0;
			material.uniforms.time.value = time / 1000;
			material.uniforms.angle.value = angle;
			material.uniforms.inverseModelMatrix.value.copy(mesh.matrixWorld).invert();
			material.uniforms.ares.value = [resx, resy, patchres];

			mesh.rotation.y = time / 100000;
			mesh.updateMatrixWorld();
		};
	});
</script>

<style>
	.planet-root {
		position: relative;
		width: 100%;
		height: 100%;
	}
	.controls {
		position: absolute;
		top: 0;
		right: 0;
		background: rgba(64, 64, 64, 0.5);
		color: silver;
		font-family: sans-serif;
		font-size: 85%;
		max-height: 100%;
		overflow-x: visible;
		overflow-y: auto;
	}
	ul {
		margin: 0;
		padding: 0;
	}
	ul > li {
		list-style-type: none;
	}
	ul > li > label {
		display: inline-block;
		width: 5em;
		text-align: right;
		margin: 0 10px;
	}
	ul > li > data {
		display: inline-block;
		width: 3em;
		text-align: right;
		color: #0f0;
		background: rgba(64, 64, 64, 0.5);
		padding: 0 0.5em;
	}
	ul > li > header {
		background: rgba(92, 60, 0, 0.5);
		margin: 2px;
		padding: 2px 1em;
		color: white;
	}
	select {
		margin: 0 10px;
		width: 128px;
	}
</style>

<div class="planet-root">
	<ThreeView {scene} {camera} {update} {run} {onCanvas} />
	<div class="controls">
	<ul>
		<li><header>Planet</header></li>
		<li>
			<label>Presets</label>
			<select bind:value={selection}>
				{#each Object.keys(planet_configs) as planetName (planetName)}
					<option value={planetName}>{planetName}</option>
				{/each}
			</select>
			<data>{selection}</data>
		</li>
		<li><Range label="Radius" min={0} max={3000} step={1} bind:value={config.radius} /></li>

		<li><header>Tectonics</header></li>
		<li><Range label="Scale" min={0} max={10} step={0.1} bind:value={config.voronoi_scale} /></li>
		<li><Range label="Amplitude" min={0} max={50} step={0.1} bind:value={config.voronoi_amplitude} /></li>
		<li><Range label="Albedo" min={0} max={1} step={0.01} bind:value={config.voronoi_albedo} /></li>
		<li><Range label="Albedo Y" min={0} max={1} step={0.01} bind:value={config.voronoi_albedo_y} /></li>
		<li><Range label="Albedo Z" min={0} max={1} step={0.01} bind:value={config.voronoi_albedo_z} /></li>

		<li><header>Plate Distortion</header></li>
		<li><Range label="Scale" min={0} max={10} step={0.1} bind:value={config.voronoi_distortion_scale} /></li>
		<li><Range label="Amplitude" min={0} max={50} step={0.1} bind:value={config.voronoi_distortion_amplitude} /></li>
		<li><Range label="Albedo" min={0} max={1} step={0.01} bind:value={config.voronoi_distortion_albedo} /></li>

		<li><header>Terrain Detail</header></li>
		<li><Range label="Scale" min={0} max={100} step={0.1} bind:value={config.detail_scale} /></li>
		<li><Range label="Amplitude" min={0} max={50} step={0.1} bind:value={config.detail_amplitude} /></li>
		<li><Range label="Albedo" min={0} max={1} step={0.01} bind:value={config.detail_albedo} /></li>

		<li><header>Water</header></li>
		<li><Range label="Level" min={0} max={1} step={0.01} bind:value={config.water_level} /></li>

		<li><header>Erosion</header></li>
		<li><Range label="Erosion Level" min={0} max={3} step={0.01} bind:value={config.erosion} /></li>
		<li><Range label="Sand" min={0} max={1} step={0.01} bind:value={config.sand_cutoff} /></li>
		<li><Range label="Vegetation" min={0} max={1} step={0.01} bind:value={config.vegetation_level} /></li>
		<li><Range label="Snow" min={0} max={1} step={0.01} bind:value={config.snow_cover} /></li>

		<li><header>Texture Noise</header></li>
		<li><Range label="Scale" min={0} max={10} step={0.01} bind:value={config.texture_noise_scale} /></li>
		<li><Range label="Amplitude" min={0} max={10} step={0.01} bind:value={config.texture_noise_amplitude} /></li>

		<li><header>Polarity</header></li>
		<li><Range label="Level" min={0} max={1} step={0.01} bind:value={config.polar_scale} /></li>
		<li><Range label="Amplitude" min={0} max={20} step={0.1} bind:value={config.polar_amplitude} /></li>

		<li><header>Rendering</header></li>
		<li><Range label="Angle" min={0} max={Math.PI} step={0.001} bind:value={angle} /></li>
		<li><Range label="Res X" min={1} max={maxres} step={1} bind:value={resx} /></li>
		<li><Range label="Res Y" min={1} max={maxres} step={1} bind:value={resy} /></li>
		<li><CheckBox label="WireFrame" bind:checked={wireframe} /></li>
		<li><CheckBox label="Illumination" bind:checked={illumination} /></li>
		<li><CheckBox label="Fragment Sampling" bind:checked={fragSampling} /></li>
		<li><CheckBox label="Multisampling" bind:checked={multisampling} /></li>
		<li><CheckBox label="Smooth" bind:checked={smoothShading} disabled={!multisampling} /></li>
		<li><CheckBox label="Normals" bind:checked={normals} /></li>
		<li><CheckBox label="Render Water" bind:checked={render_water} /></li>
	</ul>
	</div>
</div>
