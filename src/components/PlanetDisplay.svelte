<script>
    import { onMount } from 'svelte';
    
    import * as THREE from 'three';
    import { OrbitControls }  from 'three/examples/jsm/controls/OrbitControls';

    import Range from './controls/Range.svelte';
    import CheckBox from './controls/CheckBox.svelte';
    import ThreeView from './ThreeView.svelte';

    import planetVertexShader from '../shaders/planet.vert';
    import planetFragmentShader from '../shaders/planet.frag';

    import { planet_configs } from '../planet-editor/sample-planets';

    let camera;
    let scene;
    let update;
    let run = true;
    let canvasId;

    let selection='normie';
    $: setConfig(selection);

    function setConfig(s) {
        config = {...planet_configs[s]};
    }

    let angle = Math.PI / 2;
    let wireframe = false;
    let multisampling = true;
    let fragSampling = true;
    let illumination = true;
    let render_water = true;
    let normals = false;
    let smoothShading = false;
    const maxres = 96;
    let resx = 20;
    let resy = 10;
    let patchres = 16;
    let config = {
        radius: 100,
        voronoi_scale: 1,
        voronoi_amplitude: 25.6,
        voronoi_albedo: 0.85,
        voronoi_albedo_y: 1,
        voronoi_albedo_z: 1,
        voronoi_distortion_scale: 2,
        voronoi_distortion_amplitude: 4,
        voronoi_distortion_albedo: 1,
        detail_scale: 47.8,
        detail_amplitude: 8.2,
        detail_albedo: 0.55,
        water_level: 0.5,
        erosion: 1.61,
        sand_cutoff: 0.17,
        vegetation_level: 0.27,
        snow_cover: 0.39,
        texture_noise_scale: 0.46,
        texture_noise_amplitude: 2.5,
        polar_scale: 0.15,
        polar_amplitude: 12.1,
        render_water: 1.0,
        illumination: 1.0,
    }

	onMount(() => {
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 10000);
        var controls = new OrbitControls( camera, document.getElementById(canvasId) );
        controls.screenSpacePanning = true;
        controls.target = new THREE.Vector3(0, 0, 0);
        //controls.

        camera.position.z = 300;
        camera.position.y = 0;

        controls.update();

        scene = new THREE.Scene();

        // planet
        const geometry = new THREE.InstancedBufferGeometry();
        geometry.fromGeometry( new THREE.PlaneGeometry(1, 1, patchres, patchres) );
        geometry.maxInstancedCount = maxres*maxres;

        let indexes = new THREE.InstancedBufferAttribute(new Float32Array(maxres*maxres), 1, false, 1);
        for (let i=0; i<indexes.count; i++) {
            indexes.setX(i, i);
        }
        geometry.setAttribute('aIdx', indexes);
        const material = new THREE.ShaderMaterial({
            vertexShader: planetVertexShader, 
            fragmentShader: planetFragmentShader,
        });
        material.uniforms = {
            time: { value: 1.0 },
            angle: { value: Math.PI/2 },
            radius: { value: 100 },
            variation: {value: 10},
            voronoi_scale: {value: 1},
            voronoi_amplitude: {value: 28},
            voronoi_albedo: {value: 0.5},
            voronoi_albedo_y: {value: 1},
            voronoi_albedo_z: {value: 1},
            voronoi_distortion_scale: {value: 2},
            voronoi_distortion_amplitude: {value: 4},
            voronoi_distortion_albedo: {value: 0.5},
            detail_scale: {value: 40},
            detail_amplitude: {value: 1},
            detail_albedo: {value: 0.5},
            water_level: {value: 0.5},
            render_water: {value: 1.0},
            erosion: {value: 1.56},
            sand_cutoff: {value: 0.12},
            vegetation_level: {value: 0.03},
            snow_cover: {value: 0.1},
            texture_noise_scale: {value: 1.5},
            texture_noise_amplitude: {value: 3.0},
            polar_scale: {value: 0.3},
            polar_amplitude: {value: 8.5},
            illumination: {value: 1.0},
            multisampling: {value: 1.0},
            fragSampling: {value: 1.0},
            normals: {value: 0.0},
            smoothShading: {value: 1.0},
            ares: {value:[resx,resy,patchres]},
        };
        material.extensions.derivatives = true;
        material.uniforms.inverseModelMatrix = {value:  new THREE.Matrix4()};
        const mesh = new THREE.Mesh(geometry, material);
        scene.add(mesh);

        update = function (time) {
            controls.update();
            for (let k in config) {
                material.uniforms[k].value = config[k];
            }

            geometry.maxInstancedCount = resx*resy;

            material.wireframe = wireframe;
            material.uniforms.render_water.value = render_water ? 1.0 : 0.0;
            material.uniforms.illumination.value = illumination ? 1.0 : 0.0;
            material.uniforms.multisampling.value = multisampling ? 1.0 : 0.0;
            material.uniforms.fragSampling.value = fragSampling ? 1.0 : 0.0;
            material.uniforms.normals.value = normals ? 1.0 : 0.0;
            material.uniforms.smoothShading.value = smoothShading ? 1.0 : 0.0;
            material.uniforms.time.value = time/1000;
            material.uniforms.angle.value = angle;
            material.uniforms.inverseModelMatrix.value.getInverse(mesh.matrixWorld)
            material.uniforms.ares.value = [resx,resy, patchres];
            
            mesh.rotation.y = time/100000;
            mesh.matrixWorldNeedsUpdate = true;
        }
    });

</script>

<style>
div {
    position: absolute;
    top: 0;
    right: 0;
    background: rgba(64,64,64,0.5);
    color: silver;
    font-family: sans-serif;
    font-size: 85%;
    max-height: 100%;
    overflow-x: visible;
    overflow-y: auto;
}
ul {
    margin:0;
    padding:0;
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
    background: rgba(64,64,64,0.5);
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

<ThreeView {scene} {camera} {update} {run} bind:canvasId />
<div>
    <ul>
        <li><header>Planet</header></li>
        <li>
            <label>Presets</label>
            <select bind:value={selection} >
                {#each Object.keys(planet_configs) as planetName}
                    <option value={planetName}>
                        {planetName}
                    </option>
                {/each}
            </select>
            <data>{selection}</data>
        </li>
        <li><Range label='Radius' min="0" max="3000" step="1" bind:value={config.radius} /></li>

        <li><header>Tectonics</header></li>
        <li><Range label='Scale'     min="0" max="10" step="0.1" bind:value={config.voronoi_scale} /></li>
        <li><Range label="Amplitude" min="0" max="50" step="0.1" bind:value={config.voronoi_amplitude} /></li>
        <li><Range label="Albedo"    min="0" max="1" step="0.01" bind:value={config.voronoi_albedo} /></li>
        <li><Range label="Albedo Y"  min="0" max="1" step="0.01" bind:value={config.voronoi_albedo_y} /></li>
        <li><Range label="Albedo Z"  min="0" max="1" step="0.01" bind:value={config.voronoi_albedo_z} /></li>

        <li><header>Plate Distortion</header></li>
        <li><Range label="Scale"     min="0" max="10" step="0.1" bind:value={config.voronoi_distortion_scale} /></li>
        <li><Range label="Amplitude" min="0" max="50" step="0.1" bind:value={config.voronoi_distortion_amplitude} /></li>
        <li><Range label="Albedo"    min="0" max="1" step="0.01" bind:value={config.voronoi_distortion_albedo} /></li>

        <li><header>Terrain Detail</header></li>
        <li><Range label="Scale"     min="0" max="100" step="0.1" bind:value={config.detail_scale} /> </li>
        <li><Range label="Amplitude" min="0" max="50"  step="0.1" bind:value={config.detail_amplitude} /></li>
        <li><Range label="Albedo"    min="0" max="1"  step="0.01" bind:value={config.detail_albedo} /></li>
        <!--
        <li><header>Elevation in Texture</header></li>
        <li>
            <label>Level</label>
            <input type="range" min="0" max="1" step="0.01" bind:value={config.elevation_mix} /> 
            <data>{config.elevation_mix}</data>
        </li>
        -->

        <li><header>Water</header></li>
        <li><Range label="Level" min="0" max="1" step="0.01" bind:value={config.water_level} /></li>

        <li><header>Erosion</header></li>
        <li><Range label="Erosion Level" min="0" max="3" step="0.01" bind:value={config.erosion} /> </li>
        <li><Range label="Sand"          min="0" max="1" step="0.01" bind:value={config.sand_cutoff} /></li>
        <li><Range label="Vegetation"    min="0" max="1" step="0.01" bind:value={config.vegetation_level} /></li>
        <li><Range label="Snow"          min="0" max="1" step="0.01" bind:value={config.snow_cover} /></li>

        <li><header>Texture Noise</header></li>
        <li><Range label="Scale"     min="0" max="10" step="0.01" bind:value={config.texture_noise_scale} /></li>
        <li><Range label="Amplitude" min="0" max="10" step="0.01" bind:value={config.texture_noise_amplitude} /></li>

        <li><header>Polarity</header></li>
        <li><Range label="Level"     min="0" max="1" step="0.01" bind:value={config.polar_scale} /></li>
        <li><Range label="Amplitude" min="0" max="20" step="0.1" bind:value={config.polar_amplitude} /></li>

        <li><header>Rendering</header></li>
        <li><Range label="Angle" min="0" max={Math.PI} step="0.001" bind:value={angle} /></li>
        <li><Range label="Res X" min="1" max={maxres} step="1" bind:value={resx} /></li>
        <li><Range label="Res Y" min="1" max={maxres} step="1" bind:value={resy} /></li>
        <li><CheckBox label="WireFrame" bind:checked={wireframe} /></li>
        <li><CheckBox label="Illumination" bind:checked={illumination} /></li>
        <li><CheckBox label="Fragment&nbsp;Sampling" bind:checked={fragSampling} /></li>
        <li><CheckBox label="Multisampling" bind:checked={multisampling} /></li>
        <li><CheckBox label="Smooth" bind:checked={smoothShading} disabled={!multisampling}/></li>
        <li><CheckBox label="Normals" bind:checked={normals} /></li>
        <li><CheckBox label="Render Water" bind:checked={render_water} /></li>
    </ul>
</div>
<!--<button on:click={() => run=!run}>Run</button>-->
