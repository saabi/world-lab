import { n as onDestroy } from "../../chunks/index-server.js";
import { S as escape_html, a as ensure_array_like, c as stringify, i as derived, n as attr_style, o as head, r as bind_props, t as attr_class, x as attr } from "../../chunks/server.js";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { parse } from "yaml";
import { Background, Controls, Handle, Position, SvelteFlow, useSvelteFlow } from "@xyflow/svelte";
import { HighlightStyle, StreamLanguage } from "@codemirror/language";
import { EditorView } from "@codemirror/view";
import { styleTags, tags } from "@lezer/highlight";
//#region ../../packages/graph/src/ports.ts
/** Whether an output data type may connect to an input port type. */
function compatibleDataTypes(from, to) {
	if (from === to) return true;
	if (from === "vec2f" && to === "vec3f") return true;
	return false;
}
//#endregion
//#region ../../packages/graph/src/validate.ts
function validateGraph(doc) {
	const issues = [];
	const nodeMap = /* @__PURE__ */ new Map();
	for (const node of doc.nodes) nodeMap.set(node.id, node);
	const findPort = (node, portId) => [...node.inputs, ...node.outputs].find((p) => p.id === portId);
	for (const edge of doc.edges) {
		const fromNode = nodeMap.get(edge.from.node);
		const toNode = nodeMap.get(edge.to.node);
		if (!fromNode) issues.push({
			kind: "unknown-node",
			edge: edge.id,
			node: edge.from.node
		});
		if (!toNode) issues.push({
			kind: "unknown-node",
			edge: edge.id,
			node: edge.to.node
		});
		if (!fromNode || !toNode) continue;
		const fromPort = findPort(fromNode, edge.from.port);
		const toPort = findPort(toNode, edge.to.port);
		if (!fromPort) issues.push({
			kind: "unknown-port",
			edge: edge.id,
			node: edge.from.node,
			port: edge.from.port
		});
		if (!toPort) issues.push({
			kind: "unknown-port",
			edge: edge.id,
			node: edge.to.node,
			port: edge.to.port
		});
		if (!fromPort || !toPort) continue;
		if (fromPort.direction !== "out") issues.push({
			kind: "bad-direction",
			edge: edge.id,
			end: "from"
		});
		if (toPort.direction !== "in") issues.push({
			kind: "bad-direction",
			edge: edge.id,
			end: "to"
		});
		if (!compatibleDataTypes(fromPort.dataType, toPort.dataType)) issues.push({
			kind: "type-mismatch",
			edge: edge.id,
			from: fromPort.dataType,
			to: toPort.dataType
		});
		const fromSpace = fromPort.space ?? "none";
		const toSpace = toPort.space ?? "none";
		if (fromSpace !== "none" && toSpace !== "none" && fromSpace !== toSpace) issues.push({
			kind: "space-mismatch",
			edge: edge.id,
			from: fromSpace,
			to: toSpace
		});
	}
	return {
		ok: issues.length === 0,
		issues
	};
}
//#endregion
//#region ../../packages/graph/src/serialize.ts
/** Recursively sorts object keys; arrays preserve element order. */
function sortKeys(value) {
	if (Array.isArray(value)) return value.map(sortKeys);
	if (value !== null && typeof value === "object") {
		const obj = value;
		const sorted = {};
		for (const key of Object.keys(obj).sort()) sorted[key] = sortKeys(obj[key]);
		return sorted;
	}
	return value;
}
/** Produces deterministic JSON with recursively sorted keys and tab indentation. */
function serializeGraph(doc) {
	return JSON.stringify(sortKeys(doc), null, "	");
}
//#endregion
//#region ../../packages/graph/src/registry.ts
var primitives = /* @__PURE__ */ new Map();
var insertionOrder = [];
function registerPrimitive(p) {
	if (primitives.has(p.id)) throw new Error(`Primitive already registered: ${p.id}`);
	primitives.set(p.id, p);
	insertionOrder.push(p);
}
function getPrimitive(id) {
	return primitives.get(id);
}
function listPrimitives() {
	return [...insertionOrder];
}
//#endregion
//#region ../../packages/schema/src/schema.ts
/** Annotation keys (JSON-Schema `x-*` extensions). */
var X_UNIT = "x-unit";
var X_EXTENT = "x-extent";
var X_WIDGET = "x-widget";
/** Stored units per display unit (e.g. metres-per-km = 1000): the form shows value/scale. */
var X_SCALE = "x-scale";
/** Opt-in global bulk/overlay control for a field (Render panel toggles). */
var X_BULK = "x-bulk";
/** Inspector section id for one parameter field. */
var X_SECTION = "x-section";
/** Ordered inspector sections stored on an object schema. */
var X_SECTIONS = "x-sections";
/** How a value scales when consumer/body context changes. */
var X_SCALE_BEHAVIOR = "x-scale-behavior";
/**
* A physical quantity: a number annotated with a `unit` plus an optional extent
* (min/max) and default. The extent is both a real JSON-Schema constraint
* (`minimum`/`maximum`, enforced by validation) and a UI hint (`x-extent`).
*/
function quantity(unit, options = {}) {
	const { min, max, default: def, integer, description, widget, scale } = options;
	const opts = { [X_UNIT]: unit };
	if (description !== void 0) opts.description = description;
	if (widget !== void 0) opts[X_WIDGET] = widget;
	if (scale !== void 0) opts[X_SCALE] = scale;
	if (min !== void 0) opts.minimum = min;
	if (max !== void 0) opts.maximum = max;
	if (min !== void 0 || max !== void 0) opts[X_EXTENT] = [min ?? null, max ?? null];
	if (def !== void 0) opts.default = def;
	return integer ? Type.Integer(opts) : Type.Number(opts);
}
/** Extract the domain annotations from a schema (works on a serialized round-trip too). */
function annotationsOf(schema) {
	const s = schema;
	const out = {};
	if (typeof s["x-unit"] === "string") out.unit = s[X_UNIT];
	if (Array.isArray(s["x-extent"])) out.extent = s[X_EXTENT];
	if (s["x-ref"] === true) out.ref = true;
	if (typeof s["x-widget"] === "string") out.widget = s[X_WIDGET];
	if (typeof s["x-scale"] === "number") out.scale = s[X_SCALE];
	if ("default" in s) out.default = s.default;
	if (typeof s.description === "string") out.description = s.description;
	if (typeof s["x-section"] === "string") out.section = s[X_SECTION];
	if (typeof s["x-scale-behavior"] === "string") out.scaleBehavior = s[X_SCALE_BEHAVIOR];
	const bulk = bulkOf(schema);
	if (bulk) out.bulk = bulk;
	return out;
}
/** Ordered parameter sections from an object schema; malformed entries are ignored. */
function sectionsOf(schema) {
	const raw = schema[X_SECTIONS];
	if (!Array.isArray(raw)) return [];
	const sections = [];
	for (const value of raw) {
		if (!value || typeof value !== "object" || Array.isArray(value)) continue;
		const section = value;
		if (typeof section.id !== "string" || section.id.length === 0) continue;
		sections.push({
			id: section.id,
			...typeof section.label === "string" ? { label: section.label } : {},
			...typeof section.order === "number" ? { order: section.order } : {},
			...typeof section.collapsed === "boolean" ? { collapsed: section.collapsed } : {},
			...typeof section.parent === "string" ? { parent: section.parent } : {}
		});
	}
	return sections;
}
/** Extract opt-in bulk/overlay control metadata from a schema field. */
function bulkOf(schema) {
	const raw = schema[X_BULK];
	if (!raw || typeof raw !== "object") return void 0;
	const b = raw;
	if (b.panel !== "overlays") return void 0;
	if (b.mode !== "viewFilter" && b.mode !== "documentPatch") return void 0;
	if (typeof b.globalKey !== "string") return void 0;
	return {
		panel: "overlays",
		mode: b.mode,
		globalKey: b.globalKey,
		label: typeof b.label === "string" ? b.label : void 0
	};
}
/** Literal-union options (`Type.Union([Type.Literal(...)])`), or undefined. */
function enumOptions(schema) {
	const variants = schema.anyOf;
	if (Array.isArray(variants) && variants.every((v) => "const" in v)) return variants.map((v) => v.const);
}
/** Classify a schema into a widget kind for the form generator. */
function fieldKind(schema) {
	const t = schema.type;
	if (t === "boolean") return "boolean";
	if (t === "integer") return "integer";
	if (t === "number") return "number";
	if (t === "object") return "object";
	if (t === "array") return "array";
	if (enumOptions(schema)) return "enum";
	if (t === "string") return "string";
	return "unknown";
}
/** Per-property field descriptors of an object schema — what a form generator walks. */
function fields(schema) {
	const obj = schema;
	if (obj.type !== "object" || !obj.properties) return [];
	return Object.entries(obj.properties).map(([key, propSchema]) => ({
		key,
		schema: propSchema,
		kind: fieldKind(propSchema),
		annotations: annotationsOf(propSchema),
		options: enumOptions(propSchema)
	}));
}
/**
* Runtime validation against a *live* (in-memory) schema built with these factories.
*
* NB: TypeBox's checker keys off an in-memory `Symbol(Kind)` that JSON serialization
* drops. The schema's *data* — `x-*` annotations and the `type`/`minimum`/`maximum`
* constraints — round-trips fine (so it still drives the UI), but a *deserialized*
* schema must be re-hydrated (rebuilt via the factories on load) or validated with a
* JSON-Schema validator (e.g. ajv) against its plain-data form. See the serializability
* test and _docs/specs/scene-routing.md.
*/
function check(schema, value) {
	return Value.Check(schema, value);
}
//#endregion
//#region ../../packages/graph/src/primitives/perlin3d.ts
var PERM$1 = buildPermutationTable$3();
function buildPermutationTable$3() {
	const p = new Uint8Array(512);
	const base = new Uint8Array(256);
	for (let i = 0; i < 256; i++) base[i] = i;
	let seed = 1315423911;
	for (let i = 255; i > 0; i--) {
		seed = seed * 1664525 + 1013904223 >>> 0;
		const j = seed % (i + 1);
		const tmp = base[i];
		base[i] = base[j];
		base[j] = tmp;
	}
	for (let i = 0; i < 512; i++) p[i] = base[i & 255];
	return p;
}
function fade(t) {
	return t * t * t * (t * (t * 6 - 15) + 10);
}
function grad(hash, x, y, z) {
	const h = hash & 15;
	const u = h < 8 ? x : y;
	const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
	return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}
function evalPerlin3d(x, y, z) {
	const xi = Math.floor(x) & 255;
	const yi = Math.floor(y) & 255;
	const zi = Math.floor(z) & 255;
	const xf = x - Math.floor(x);
	const yf = y - Math.floor(y);
	const zf = z - Math.floor(z);
	const u = fade(xf);
	const v = fade(yf);
	const w = fade(zf);
	const aaa = PERM$1[PERM$1[PERM$1[xi] + yi] + zi];
	const aba = PERM$1[PERM$1[PERM$1[xi] + yi + 1] + zi];
	const aab = PERM$1[PERM$1[PERM$1[xi] + yi] + zi + 1];
	const abb = PERM$1[PERM$1[PERM$1[xi] + yi + 1] + zi + 1];
	const baa = PERM$1[PERM$1[PERM$1[xi + 1] + yi] + zi];
	const bba = PERM$1[PERM$1[PERM$1[xi + 1] + yi + 1] + zi];
	const bab = PERM$1[PERM$1[PERM$1[xi + 1] + yi] + zi + 1];
	const bbb = PERM$1[PERM$1[PERM$1[xi + 1] + yi + 1] + zi + 1];
	return lerp(lerp(lerp(grad(aaa, xf, yf, zf), grad(baa, xf - 1, yf, zf), u), lerp(grad(aba, xf, yf - 1, zf), grad(bba, xf - 1, yf - 1, zf), u), v), lerp(lerp(grad(aab, xf, yf, zf - 1), grad(bab, xf - 1, yf, zf - 1), u), lerp(grad(abb, xf, yf - 1, zf - 1), grad(bbb, xf - 1, yf - 1, zf - 1), u), v), w);
}
function lerp(a, b, t) {
	return a + t * (b - a);
}
registerPrimitive({
	id: "noise.perlin3d",
	category: "noise",
	inputs: [{
		name: "position",
		dataType: "vec3f"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "noise.perlin3d",
		entry: "perlin3d"
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position;
		return { value: evalPerlin3d(position[0], position[1], position[2]) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/simplex.ts
var PERM = buildPermutationTable$2();
var GRAD3 = [
	[
		1,
		1,
		0
	],
	[
		-1,
		1,
		0
	],
	[
		1,
		-1,
		0
	],
	[
		-1,
		-1,
		0
	],
	[
		1,
		0,
		1
	],
	[
		-1,
		0,
		1
	],
	[
		1,
		0,
		-1
	],
	[
		-1,
		0,
		-1
	],
	[
		0,
		1,
		1
	],
	[
		0,
		-1,
		1
	],
	[
		0,
		1,
		-1
	],
	[
		0,
		-1,
		-1
	]
];
var F3 = 1 / 3;
var G3 = 1 / 6;
function buildPermutationTable$2() {
	const p = new Uint8Array(512);
	const base = new Uint8Array(256);
	for (let i = 0; i < 256; i++) base[i] = i;
	let seed = 1315423911;
	for (let i = 255; i > 0; i--) {
		seed = seed * 1664525 + 1013904223 >>> 0;
		const j = seed % (i + 1);
		const tmp = base[i];
		base[i] = base[j];
		base[j] = tmp;
	}
	for (let i = 0; i < 512; i++) p[i] = base[i & 255];
	return p;
}
function dot3(g, x, y, z) {
	return g[0] * x + g[1] * y + g[2] * z;
}
function contrib(x, y, z, gi) {
	const t = .6 - x * x - y * y - z * z;
	if (t < 0) return 0;
	const g = GRAD3[gi % 12];
	return t * t * t * t * dot3(g, x, y, z);
}
function evalSimplex3d(x, y, z) {
	const s = (x + y + z) * F3;
	const i = Math.floor(x + s);
	const j = Math.floor(y + s);
	const k = Math.floor(z + s);
	const t = (i + j + k) * G3;
	const x0 = x - (i - t);
	const y0 = y - (j - t);
	const z0 = z - (k - t);
	let i1;
	let j1;
	let k1;
	let i2;
	let j2;
	let k2;
	if (x0 >= y0) if (y0 >= z0) {
		i1 = 1;
		j1 = 0;
		k1 = 0;
		i2 = 1;
		j2 = 1;
		k2 = 0;
	} else if (x0 >= z0) {
		i1 = 1;
		j1 = 0;
		k1 = 0;
		i2 = 1;
		j2 = 0;
		k2 = 1;
	} else {
		i1 = 0;
		j1 = 0;
		k1 = 1;
		i2 = 1;
		j2 = 0;
		k2 = 1;
	}
	else if (y0 < z0) {
		i1 = 0;
		j1 = 0;
		k1 = 1;
		i2 = 0;
		j2 = 1;
		k2 = 1;
	} else if (x0 < z0) {
		i1 = 0;
		j1 = 1;
		k1 = 0;
		i2 = 0;
		j2 = 1;
		k2 = 1;
	} else {
		i1 = 0;
		j1 = 1;
		k1 = 0;
		i2 = 1;
		j2 = 1;
		k2 = 0;
	}
	const ii = i & 255;
	const jj = j & 255;
	const kk = k & 255;
	const gi0 = PERM[ii + PERM[jj + PERM[kk]]] % 12;
	const gi1 = PERM[ii + i1 + PERM[jj + j1 + PERM[kk + k1]]] % 12;
	const gi2 = PERM[ii + i2 + PERM[jj + j2 + PERM[kk + k2]]] % 12;
	const gi3 = PERM[ii + 1 + PERM[jj + 1 + PERM[kk + 1]]] % 12;
	const n0 = contrib(x0, y0, z0, gi0);
	const n1 = contrib(x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, gi1);
	const n2 = contrib(x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3, gi2);
	const n3 = contrib(x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, gi3);
	return 32 * (n0 + n1 + n2 + n3);
}
registerPrimitive({
	id: "noise.simplex",
	category: "noise",
	inputs: [{
		name: "position",
		dataType: "vec3f"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "noise.simplex",
		entry: "simplex3d"
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position;
		return { value: evalSimplex3d(position[0], position[1], position[2]) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/worley.ts
function hash3(ix, iy, iz) {
	let n = ix * 374761393 + iy * 668265263 + iz * 1274126177 >>> 0;
	n = (n ^ n >>> 13) * 1274126177;
	n = n ^ n >>> 16;
	return (n & 65535) / 65535;
}
function featurePoint(ix, iy, iz) {
	return [
		hash3(ix, iy, iz),
		hash3(iy, iz, ix),
		hash3(iz, ix, iy)
	];
}
function evalWorley3d(x, y, z) {
	const xi = Math.floor(x);
	const yi = Math.floor(y);
	const zi = Math.floor(z);
	const xf = x - xi;
	const yf = y - yi;
	const zf = z - zi;
	let minDist = 1;
	for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
		const fp = featurePoint(xi + i, yi + j, zi + k);
		const dx = i + fp[0] - xf;
		const dy = j + fp[1] - yf;
		const dz = k + fp[2] - zf;
		const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
		minDist = Math.min(minDist, dist);
	}
	return minDist;
}
registerPrimitive({
	id: "noise.worley",
	category: "noise",
	inputs: [{
		name: "position",
		dataType: "vec3f"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "noise.worley",
		entry: "worley"
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position;
		return { value: evalWorley3d(position[0], position[1], position[2]) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/fbm.ts
function evalFbm3d(x, y, z, octaves, persistence, lacunarity) {
	let value = 0;
	let amplitude = 1;
	let frequency = 1;
	let maxValue = 0;
	for (let i = 0; i < octaves; i++) {
		value += amplitude * evalPerlin3d(x * frequency, y * frequency, z * frequency);
		maxValue += amplitude;
		amplitude *= persistence;
		frequency *= lacunarity;
	}
	return value / maxValue;
}
registerPrimitive({
	id: "noise.fbm",
	category: "noise",
	inputs: [{
		name: "position",
		dataType: "vec3f"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({
		octaves: quantity("none", {
			integer: true,
			default: 4,
			min: 1,
			max: 8
		}),
		persistence: quantity("none", {
			default: .5,
			min: 0,
			max: 1
		}),
		lacunarity: quantity("none", {
			default: 2,
			min: 1,
			max: 4
		})
	}),
	wgsl: {
		moduleId: "noise.fbm",
		entry: "fbm"
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position;
		const octaves = ctx.params.octaves;
		const persistence = ctx.params.persistence;
		const lacunarity = ctx.params.lacunarity;
		return { value: evalFbm3d(position[0], position[1], position[2], octaves, persistence, lacunarity) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/ridgedFbm.ts
function evalRidgedFbm3d(x, y, z, octaves, persistence, lacunarity, offset) {
	let value = 0;
	let amplitude = 1;
	let frequency = 1;
	let weight = 1;
	for (let i = 0; i < octaves; i++) {
		let signal = offset - Math.abs(evalPerlin3d(x * frequency, y * frequency, z * frequency));
		signal *= signal;
		signal *= weight;
		weight = Math.min(1, signal * 2);
		value += signal * amplitude;
		amplitude *= persistence;
		frequency *= lacunarity;
	}
	return value;
}
registerPrimitive({
	id: "noise.ridgedFbm",
	category: "noise",
	inputs: [{
		name: "position",
		dataType: "vec3f"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({
		octaves: quantity("none", {
			integer: true,
			default: 4,
			min: 1,
			max: 8
		}),
		persistence: quantity("none", {
			default: .5,
			min: 0,
			max: 1
		}),
		lacunarity: quantity("none", {
			default: 2,
			min: 1,
			max: 4
		}),
		offset: quantity("none", {
			default: 1,
			min: 0,
			max: 2
		})
	}),
	wgsl: {
		moduleId: "noise.ridgedFbm",
		entry: "ridgedFbm"
	},
	evalCPU(ctx) {
		const position = ctx.inputs.position;
		const octaves = ctx.params.octaves;
		const persistence = ctx.params.persistence;
		const lacunarity = ctx.params.lacunarity;
		const offset = ctx.params.offset;
		return { value: evalRidgedFbm3d(position[0], position[1], position[2], octaves, persistence, lacunarity, offset) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/remap.ts
registerPrimitive({
	id: "math.remap",
	category: "math",
	inputs: [{
		name: "x",
		dataType: "f32"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({
		inMin: quantity("none", { default: 0 }),
		inMax: quantity("none", { default: 1 }),
		outMin: quantity("none", { default: 0 }),
		outMax: quantity("none", { default: 1 })
	}),
	wgsl: {
		moduleId: "math.remap",
		entry: "remap"
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x;
		const inMin = ctx.params.inMin;
		const inMax = ctx.params.inMax;
		const outMin = ctx.params.outMin;
		const outMax = ctx.params.outMax;
		return { value: outMin + (x - inMin) / (inMax - inMin) * (outMax - outMin) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/add.ts
registerPrimitive({
	id: "math.add",
	category: "math",
	inputs: [{
		name: "a",
		dataType: "f32"
	}, {
		name: "b",
		dataType: "f32"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "math.add",
		entry: "add"
	},
	evalCPU(ctx) {
		return { value: ctx.inputs.a + ctx.inputs.b };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/multiply.ts
registerPrimitive({
	id: "math.multiply",
	category: "math",
	inputs: [{
		name: "a",
		dataType: "f32"
	}, {
		name: "b",
		dataType: "f32"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "math.multiply",
		entry: "multiply"
	},
	evalCPU(ctx) {
		return { value: ctx.inputs.a * ctx.inputs.b };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/mix.ts
registerPrimitive({
	id: "math.mix",
	category: "math",
	inputs: [
		{
			name: "a",
			dataType: "f32"
		},
		{
			name: "b",
			dataType: "f32"
		},
		{
			name: "t",
			dataType: "f32"
		}
	],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "math.mix",
		entry: "mix"
	},
	evalCPU(ctx) {
		const a = ctx.inputs.a;
		const b = ctx.inputs.b;
		const t = ctx.inputs.t;
		return { value: a + (b - a) * t };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/pow.ts
registerPrimitive({
	id: "math.pow",
	category: "math",
	inputs: [{
		name: "x",
		dataType: "f32"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({ exponent: quantity("none", { default: 2 }) }),
	wgsl: {
		moduleId: "math.pow",
		entry: "pow"
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x;
		const exponent = ctx.params.exponent;
		return { value: Math.pow(x, exponent) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/clamp.ts
registerPrimitive({
	id: "math.clamp",
	category: "math",
	inputs: [{
		name: "x",
		dataType: "f32"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({
		min: quantity("none", { default: 0 }),
		max: quantity("none", { default: 1 })
	}),
	wgsl: {
		moduleId: "math.clamp",
		entry: "clamp"
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x;
		const min = ctx.params.min;
		const max = ctx.params.max;
		return { value: Math.min(max, Math.max(min, x)) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/smoothstep.ts
registerPrimitive({
	id: "math.smoothstep",
	category: "math",
	inputs: [{
		name: "x",
		dataType: "f32"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({
		edge0: quantity("none", { default: 0 }),
		edge1: quantity("none", { default: 1 })
	}),
	wgsl: {
		moduleId: "math.smoothstep",
		entry: "smoothstep"
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x;
		const edge0 = ctx.params.edge0;
		const edge1 = ctx.params.edge1;
		const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
		return { value: t * t * (3 - 2 * t) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/bias.ts
/** Perlin bias curve — pushes values toward 0 or 1 depending on bias amount. */
function evalBias(x, bias) {
	return x / ((1 / bias - 2) * (1 - x) + 1);
}
registerPrimitive({
	id: "math.bias",
	category: "math",
	inputs: [{
		name: "x",
		dataType: "f32"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({ bias: quantity("none", {
		default: .5,
		min: .001,
		max: .999
	}) }),
	wgsl: {
		moduleId: "math.bias",
		entry: "bias"
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x;
		const amount = ctx.params.bias;
		return { value: evalBias(x, amount) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/gain.ts
/** Perlin gain curve — contrast around 0.5; gain 0.5 is identity. */
function evalGain(x, gain) {
	if (x < .5) return .5 * evalBias(2 * x, gain);
	return .5 + .5 * evalBias(2 * x - 1, 1 - gain);
}
registerPrimitive({
	id: "math.gain",
	category: "math",
	inputs: [{
		name: "x",
		dataType: "f32"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({ gain: quantity("none", {
		default: .5,
		min: .001,
		max: .999
	}) }),
	wgsl: {
		moduleId: "math.gain",
		entry: "gain"
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x;
		const amount = ctx.params.gain;
		return { value: evalGain(x, amount) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/abs.ts
registerPrimitive({
	id: "math.abs",
	category: "math",
	inputs: [{
		name: "x",
		dataType: "f32"
	}],
	outputs: [{
		name: "value",
		dataType: "f32"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "math.abs",
		entry: "abs"
	},
	evalCPU(ctx) {
		const x = ctx.inputs.x;
		return { value: Math.abs(x) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/uv.ts
registerPrimitive({
	id: "procedural.uv",
	category: "Input",
	inputs: [],
	outputs: [{
		name: "uv",
		dataType: "vec2f",
		space: "none"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "procedural.uv",
		entry: "uv"
	},
	evalCPU(ctx) {
		const uvValue = ctx.procedural?.uv;
		if (uvValue === void 0) throw new Error("procedural.uv requires ctx.procedural.uv");
		return { uv: uvValue };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/metricPosition.ts
registerPrimitive({
	id: "procedural.metricPosition",
	category: "procedural",
	inputs: [],
	outputs: [{
		name: "position",
		dataType: "vec3f",
		space: "none"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "procedural.metricPosition",
		entry: "metricPosition"
	},
	evalCPU(ctx) {
		const position = ctx.procedural?.metricPosition;
		if (position === void 0 || !Array.isArray(position) || position.length < 3) return { position: [
			0,
			0,
			0
		] };
		return { position: [...position] };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/surfaces/plane.ts
registerPrimitive({
	id: "surface.plane",
	category: "surface",
	inputs: [{
		name: "uv",
		dataType: "vec2f"
	}],
	outputs: [{
		name: "position",
		dataType: "vec3f",
		space: "none"
	}, {
		name: "normal",
		dataType: "vec3f",
		space: "none"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "surface.plane",
		entry: "plane"
	},
	evalCPU(ctx) {
		const uv = ctx.inputs.uv;
		const u = uv[0];
		const v = uv[1];
		return {
			position: [
				2 * u - 1,
				2 * v - 1,
				0
			],
			normal: [
				0,
				0,
				1
			]
		};
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/surfaces/cubeSphere.ts
function normalize3(v) {
	const len = Math.hypot(v[0], v[1], v[2]);
	if (len === 0) return [
		0,
		0,
		1
	];
	return [
		v[0] / len,
		v[1] / len,
		v[2] / len
	];
}
/** Cube face 0 = +X … 5 = -Z; uv maps to s,t in [-1,1] per M11.1 / planet patches convention. */
function cubeFaceUvToPosition(face, u, v) {
	const s = u * 2 - 1;
	const t = v * 2 - 1;
	switch (face) {
		case 0: return [
			1,
			t,
			-s
		];
		case 1: return [
			-1,
			t,
			s
		];
		case 2: return [
			s,
			1,
			-t
		];
		case 3: return [
			s,
			-1,
			t
		];
		case 4: return [
			s,
			t,
			1
		];
		case 5: return [
			-s,
			t,
			-1
		];
		default: return [
			0,
			0,
			1
		];
	}
}
registerPrimitive({
	id: "surface.cubeSphere",
	category: "surface",
	inputs: [{
		name: "uv",
		dataType: "vec2f"
	}],
	outputs: [{
		name: "position",
		dataType: "vec3f",
		space: "body_pos"
	}, {
		name: "normal",
		dataType: "vec3f",
		space: "body_dir"
	}],
	params: Type.Object({ face: Type.Integer({
		minimum: 0,
		maximum: 5,
		default: 0
	}) }),
	wgsl: {
		moduleId: "surface.cubeSphere",
		entry: "cubeSphere"
	},
	evalCPU(ctx) {
		const uv = ctx.inputs.uv;
		const face = ctx.params.face;
		const position = normalize3(cubeFaceUvToPosition(face, uv[0], uv[1]));
		return {
			position,
			normal: position
		};
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/_params.ts
/** Shared planet shaping params (mirrors PlanetParams uniform fields). */
var planetRadiusParam = quantity("m", { default: 100 });
var freqParam = (defaultValue) => quantity("1/m", { default: defaultValue });
var ratioRParam = (defaultValue) => quantity("none", { default: defaultValue });
var pureParam = (defaultValue) => quantity("none", { default: defaultValue });
var scaleMppInput = {
	name: "meters_per_pixel",
	dataType: "f32",
	space: "scale_ctx"
};
//#endregion
//#region ../../packages/graph/src/primitives/terrain/domainWarp.ts
registerPrimitive({
	id: "terrain.domainWarp",
	category: "terrain",
	inputs: [{
		name: "unit_dir",
		dataType: "vec3f",
		space: "body_dir"
	}, scaleMppInput],
	outputs: [{
		name: "distortion",
		dataType: "f32"
	}],
	params: Type.Object({
		voronoi_distortion_scale: freqParam(0),
		radius: planetRadiusParam
	}),
	wgsl: {
		moduleId: "terrain.domainWarp",
		entry: "domainWarp"
	},
	metadata: { keywords: ["Domain", "Terrain"] }
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/voronoi.ts
registerPrimitive({
	id: "terrain.voronoi",
	category: "terrain",
	inputs: [
		{
			name: "unit_dir",
			dataType: "vec3f",
			space: "body_dir"
		},
		{
			name: "distortion",
			dataType: "f32"
		},
		scaleMppInput
	],
	outputs: [{
		name: "vor",
		dataType: "vec3f"
	}],
	params: Type.Object({
		voronoi_scale: freqParam(1),
		voronoi_distortion_amplitude: pureParam(0),
		radius: planetRadiusParam
	}),
	wgsl: {
		moduleId: "terrain.voronoi",
		entry: "voronoi"
	},
	metadata: { keywords: ["Domain", "Terrain"] }
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/detailFbm.ts
registerPrimitive({
	id: "terrain.detailFbm",
	category: "terrain",
	inputs: [{
		name: "unit_dir",
		dataType: "vec3f",
		space: "body_dir"
	}, scaleMppInput],
	outputs: [{
		name: "detail",
		dataType: "f32"
	}],
	params: Type.Object({
		detail_scale: freqParam(1),
		radius: planetRadiusParam
	}),
	wgsl: {
		moduleId: "terrain.detailFbm",
		entry: "detailFbm"
	},
	metadata: { keywords: ["Domain", "Terrain"] }
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/heightRemap.ts
function evalHeightRemap(vor, detail, params) {
	const v_amp = params.voronoi_amplitude * params.radius;
	const d_amp = params.detail_amplitude * params.radius;
	const total_amplitude = v_amp + d_amp;
	const wl = total_amplitude * (params.water_level - .5);
	let height = (vor[0] - .5) * v_amp + (detail - .5) * d_amp;
	let th = height - wl;
	const thf = th > 0 ? total_amplitude - wl : wl - params.radius;
	th = th / thf;
	th = Math.pow(th, params.erosion);
	th *= thf;
	height = wl + th;
	return params.radius + height;
}
registerPrimitive({
	id: "terrain.heightRemap",
	category: "terrain",
	inputs: [{
		name: "vor",
		dataType: "vec3f"
	}, {
		name: "detail",
		dataType: "f32"
	}],
	outputs: [{
		name: "world_radius_meters",
		dataType: "f32",
		space: "world_radius_meters"
	}],
	params: Type.Object({
		voronoi_amplitude: ratioRParam(.01),
		detail_amplitude: ratioRParam(.01),
		water_level: pureParam(.5),
		erosion: pureParam(1),
		radius: planetRadiusParam
	}),
	wgsl: {
		moduleId: "terrain.heightRemap",
		entry: "heightRemap"
	},
	metadata: { keywords: ["Domain", "Terrain"] },
	evalCPU(ctx) {
		const vor = ctx.inputs.vor;
		const detail = ctx.inputs.detail;
		return { world_radius_meters: evalHeightRemap([
			vor[0],
			vor[1],
			vor[2]
		], detail, ctx.params) };
	}
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/fineTextureNoise.ts
registerPrimitive({
	id: "terrain.fineTextureNoise",
	category: "terrain",
	inputs: [{
		name: "unit_dir",
		dataType: "vec3f",
		space: "body_dir"
	}, scaleMppInput],
	outputs: [{
		name: "texture_offset",
		dataType: "f32",
		space: "height_meters"
	}],
	params: Type.Object({
		texture_noise_scale: pureParam(1),
		texture_noise_amplitude: ratioRParam(.001),
		radius: planetRadiusParam
	}),
	wgsl: {
		moduleId: "terrain.fineTextureNoise",
		entry: "fineTextureNoise"
	},
	metadata: { keywords: ["Domain", "Terrain"] }
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/polarTerm.ts
registerPrimitive({
	id: "terrain.polarTerm",
	category: "terrain",
	inputs: [{
		name: "world_pos",
		dataType: "vec3f",
		space: "world_pos"
	}, scaleMppInput],
	outputs: [{
		name: "polar_offset",
		dataType: "f32",
		space: "height_meters"
	}],
	params: Type.Object({
		polar_scale: pureParam(0),
		polar_amplitude: ratioRParam(0),
		radius: planetRadiusParam
	}),
	wgsl: {
		moduleId: "terrain.polarTerm",
		entry: "polarTerm"
	},
	metadata: { keywords: ["Domain", "Terrain"] }
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/biomeMaterial.ts
registerPrimitive({
	id: "terrain.biomeMaterial",
	category: "material",
	inputs: [
		{
			name: "sample_unit_dir",
			dataType: "vec3f",
			space: "body_dir"
		},
		{
			name: "sample_world_pos",
			dataType: "vec3f",
			space: "world_pos"
		},
		{
			name: "sample_height_meters",
			dataType: "f32",
			space: "height_meters"
		},
		{
			name: "sample_distortion",
			dataType: "f32"
		},
		{
			name: "sample_vor",
			dataType: "vec3f"
		},
		{
			name: "sample_detail",
			dataType: "f32"
		},
		scaleMppInput
	],
	outputs: [{
		name: "albedo",
		dataType: "vec3f"
	}, {
		name: "roughness",
		dataType: "f32"
	}],
	params: Type.Object({
		voronoi_albedo: pureParam(1),
		voronoi_albedo_y: pureParam(1),
		voronoi_albedo_z: pureParam(1),
		voronoi_distortion_albedo: pureParam(1),
		detail_albedo: pureParam(1),
		voronoi_amplitude: ratioRParam(.01),
		detail_amplitude: ratioRParam(.01),
		water_level: pureParam(.5),
		vegetation_level: pureParam(0),
		sand_cutoff: pureParam(0),
		snow_cover: pureParam(1),
		texture_noise_scale: pureParam(1),
		texture_noise_amplitude: ratioRParam(0),
		polar_scale: pureParam(0),
		polar_amplitude: ratioRParam(0),
		radius: planetRadiusParam
	}),
	wgsl: {
		moduleId: "terrain.biomeMaterial",
		entry: "biomeMaterial"
	},
	metadata: { keywords: ["Domain", "Material"] }
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/normalEstimator.ts
registerPrimitive({
	id: "terrain.normalEstimator",
	category: "terrain",
	inputs: [{
		name: "unit_dir",
		dataType: "vec3f",
		space: "body_dir"
	}, scaleMppInput],
	outputs: [{
		name: "normal",
		dataType: "vec3f",
		space: "body_dir"
	}],
	params: Type.Object({
		radius: planetRadiusParam,
		voronoi_scale: Type.Number({ default: 1 }),
		voronoi_amplitude: Type.Number({ default: .01 }),
		voronoi_distortion_scale: Type.Number({ default: 0 }),
		voronoi_distortion_amplitude: Type.Number({ default: 0 }),
		detail_scale: Type.Number({ default: 1 }),
		detail_amplitude: Type.Number({ default: .01 }),
		water_level: Type.Number({ default: .5 }),
		erosion: Type.Number({ default: 1 })
	}),
	wgsl: {
		moduleId: "terrain.normalEstimator",
		entry: "normalEstimator"
	},
	metadata: { keywords: ["Domain", "Terrain"] }
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/worldNormal.ts
registerPrimitive({
	id: "terrain.worldNormal",
	category: "terrain",
	inputs: [{
		name: "body_normal",
		dataType: "vec3f",
		space: "body_dir"
	}, {
		name: "planet_rot",
		dataType: "vec4f"
	}],
	outputs: [{
		name: "normal",
		dataType: "vec3f",
		space: "world_dir"
	}],
	params: Type.Object({}),
	wgsl: {
		moduleId: "terrain.worldNormal",
		entry: "worldNormal"
	},
	metadata: { keywords: ["Domain", "Terrain"] }
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/selfShadow.ts
registerPrimitive({
	id: "terrain.selfShadow",
	category: "terrain",
	inputs: [
		{
			name: "surface_pos",
			dataType: "vec3f",
			space: "world_pos"
		},
		{
			name: "sun_dir",
			dataType: "vec3f",
			space: "world_dir"
		},
		{
			name: "meters_per_pixel",
			dataType: "f32",
			space: "scale_ctx"
		},
		{
			name: "planet_rot",
			dataType: "vec4f"
		}
	],
	outputs: [{
		name: "shadow",
		dataType: "f32"
	}],
	params: Type.Object({
		radius: planetRadiusParam,
		voronoi_scale: Type.Number({ default: 1 }),
		voronoi_amplitude: ratioRParam(.01),
		voronoi_distortion_scale: Type.Number({ default: 0 }),
		voronoi_distortion_amplitude: Type.Number({ default: 0 }),
		detail_amplitude: ratioRParam(.01),
		water_level: pureParam(.5),
		erosion: pureParam(1),
		softness: pureParam(.5),
		step_count: Type.Number({ default: 16 })
	}),
	wgsl: {
		moduleId: "terrain.selfShadow",
		entry: "selfShadow"
	},
	metadata: { keywords: [
		"Domain",
		"Terrain",
		"Effects"
	] }
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/pbrLighting.ts
registerPrimitive({
	id: "material.pbrLighting",
	category: "material",
	inputs: [
		{
			name: "albedo",
			dataType: "vec3f"
		},
		{
			name: "roughness",
			dataType: "f32"
		},
		{
			name: "metallic",
			dataType: "f32"
		},
		{
			name: "ior",
			dataType: "f32"
		},
		{
			name: "normal",
			dataType: "vec3f",
			space: "world_dir"
		},
		{
			name: "view",
			dataType: "vec3f",
			space: "world_dir"
		},
		{
			name: "surface_pos",
			dataType: "vec3f",
			space: "world_pos"
		},
		{
			name: "sun_shadow",
			dataType: "f32"
		}
	],
	outputs: [{
		name: "color",
		dataType: "vec3f"
	}],
	params: Type.Object({ exposure: Type.Number({ default: 1 }) }),
	wgsl: {
		moduleId: "material.pbrLighting",
		entry: "pbrLighting"
	},
	metadata: { keywords: [
		"Domain",
		"Material",
		"Effects"
	] }
});
//#endregion
//#region ../../packages/graph/src/primitives/terrain/cubeFaceDir.ts
function cubeFaceUvToUnitDir(face, u, v) {
	const a = u * 2 - 1;
	const b = v * 2 - 1;
	let pos;
	switch (face) {
		case 0:
			pos = [
				1,
				b,
				-a
			];
			break;
		case 1:
			pos = [
				-1,
				b,
				a
			];
			break;
		case 2:
			pos = [
				a,
				1,
				-b
			];
			break;
		case 3:
			pos = [
				a,
				-1,
				b
			];
			break;
		case 4:
			pos = [
				a,
				b,
				1
			];
			break;
		default:
			pos = [
				-a,
				b,
				-1
			];
			break;
	}
	const len = Math.hypot(pos[0], pos[1], pos[2]);
	return [
		pos[0] / len,
		pos[1] / len,
		pos[2] / len
	];
}
registerPrimitive({
	id: "surface.cubeFaceDir",
	category: "surface",
	inputs: [{
		name: "uv",
		dataType: "vec2f"
	}],
	outputs: [{
		name: "unit_dir",
		dataType: "vec3f",
		space: "body_dir"
	}],
	params: Type.Object({ face: Type.Integer({
		minimum: 0,
		maximum: 5,
		default: 0
	}) }),
	wgsl: {
		moduleId: "surface.cubeFaceDir",
		entry: "cubeFaceDir"
	},
	metadata: { keywords: ["Domain", "Surface"] },
	evalCPU(ctx) {
		const uv = ctx.inputs.uv;
		const face = ctx.params.face;
		return { unit_dir: cubeFaceUvToUnitDir(face, uv[0], uv[1]) };
	}
});
typeof navigator === "undefined" || navigator.platform;
//#endregion
//#region ../../packages/subdivide/src/layout/runtime.ts
var DividerData = class {
	id;
	type;
	parent;
	position;
	prev;
	next;
	constructor(options) {
		this.id = options.id;
		this.type = options.type;
		this.parent = options.group;
		this.position = options.position;
		this.prev = options.prev;
		this.next = options.next;
		options.group.dividers.push(this);
	}
	destroy(dividers) {
		const index = dividers.indexOf(this);
		if (index === -1) throw new Error("Unexpected error");
		dividers.splice(index, 1);
	}
};
function isPaneData(node) {
	return "zone" in node;
}
//#endregion
//#region ../../packages/subdivide/src/layout/id.ts
function createPaneId() {
	return Math.random().toString(36).slice(2);
}
//#endregion
//#region ../../packages/subdivide/src/layout/utils.ts
function removeFromArray(array, item) {
	const index = array.indexOf(item);
	if (index === -1) throw new Error("Unexpected error");
	array.splice(index, 1);
}
//#endregion
//#region ../../packages/subdivide/src/PaneHeader.svelte
function PaneHeader($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { paneId, zone, availableZones, zoneLabels, onzonechange } = $$props;
		let menuOpen = false;
		const triggerId = derived(() => `subdivide-menu-${paneId}-trigger`);
		const menuListId = derived(() => `subdivide-menu-${paneId}-list`);
		const paneTypeLabel = derived(() => zoneLabels[zone] ?? zone);
		$$renderer.push(`<div${attr_class("pane-header svelte-wt065y", void 0, { "menu-open": menuOpen })} role="toolbar" tabindex="-1" aria-label="Pane controls"><button type="button"${attr("id", triggerId())} class="menu-trigger svelte-wt065y" aria-label="Change pane type" aria-haspopup="menu"${attr("aria-expanded", menuOpen)}${attr("aria-controls", menuListId())}${attr("title", `Change pane type (${paneTypeLabel()})`)}></button> <ul${attr("id", menuListId())} class="menu svelte-wt065y" role="menu"${attr("aria-labelledby", triggerId())}><!--[-->`);
		const each_array = ensure_array_like(availableZones);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let z = each_array[$$index];
			$$renderer.push(`<li role="none" class="svelte-wt065y"><button type="button" role="menuitemradio"${attr("aria-checked", z === zone)}${attr_class("svelte-wt065y", void 0, { "selected": z === zone })}>${escape_html(zoneLabels[z] ?? z)}</button></li>`);
		}
		$$renderer.push(`<!--]--></ul></div>`);
	});
}
//#endregion
//#region ../../packages/subdivide/src/Pane.svelte
function Pane($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { pane, layoutTick, modifierPressed, zones, zoneLabels, availableZones, onsplit, onzonechange, oncontextmenu } = $$props;
		const frame = derived(() => {
			return {
				left: pane.getLeft() * 100,
				top: pane.getTop() * 100,
				width: pane.getWidth() * 100,
				height: pane.getHeight() * 100,
				zone: pane.zone
			};
		});
		const cursor = derived(() => {});
		$$renderer.push(`<div class="pane svelte-12tdxmr"${attr_style("", {
			left: `${stringify(frame().left)}%`,
			top: `${stringify(frame().top)}%`,
			width: `${stringify(frame().width)}%`,
			height: `${stringify(frame().height)}%`
		})}><div class="inner svelte-12tdxmr" role="tabpanel" tabindex="0"${attr("aria-label", zoneLabels[frame().zone] ?? frame().zone)}${attr_style("", { cursor })}>`);
		PaneHeader($$renderer, {
			paneId: pane.id,
			zone: frame().zone,
			availableZones,
			zoneLabels,
			onzonechange: (zone) => onzonechange?.(zone)
		});
		$$renderer.push(`<!----> <!---->`);
		$$renderer.push(`<div class="zone-content svelte-12tdxmr">`);
		if (zones[frame().zone]) {
			$$renderer.push("<!--[0-->");
			zones[frame().zone]($$renderer);
			$$renderer.push(`<!---->`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div>`);
		$$renderer.push(`<!----></div></div>`);
	});
}
//#endregion
//#region ../../packages/subdivide/src/Divider.svelte
function Divider($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { divider, layoutTick, onmousedown } = $$props;
		const style = derived(() => {
			const group = divider.parent;
			const x = group.getLeft();
			const y = group.getTop();
			const w = group.getWidth();
			const h = group.getHeight();
			const position = divider.position ?? 0;
			if (divider.type === "horizontal") return `left: ${x * 100}%; top: ${(y + position * h) * 100}%; width: ${w * 100}%; height: 0`;
			return `top: ${y * 100}%; left: ${(x + position * w) * 100}%; width: 0; height: ${h * 100}%`;
		});
		const ariaValueNow = derived(() => Math.round((divider.position ?? .5) * 100));
		const resizeLabel = derived(() => divider.type === "horizontal" ? "Resize horizontal pane split" : "Resize vertical pane split");
		$$renderer.push(`<div${attr_class(`divider ${stringify(divider.type)}`, "svelte-1qb3kye")}${attr_style(style())} role="slider" tabindex="0"${attr("aria-label", resizeLabel())}${attr("aria-orientation", divider.type === "horizontal" ? "horizontal" : "vertical")}${attr("aria-valuemin", 0)}${attr("aria-valuemax", 100)}${attr("aria-valuenow", ariaValueNow())}></div>`);
	});
}
//#endregion
//#region ../../packages/subdivide/src/layout/menu.ts
var PANE_MENU_SEPARATOR_ID = "__separator__";
function isPaneMenuSeparator(action) {
	return action.id === PANE_MENU_SEPARATOR_ID;
}
function paneMenuSeparator() {
	return {
		id: PANE_MENU_SEPARATOR_ID,
		label: "",
		run: () => {}
	};
}
/** Built-in layout actions + host zone actions, in display order. Pure. */
function composePaneMenu(zone, zoneMenus, builtins) {
	const zoneActions = zoneMenus?.[zone];
	if (!zoneActions || zoneActions.length === 0) return [...builtins];
	return [
		...zoneActions,
		paneMenuSeparator(),
		...builtins
	];
}
//#endregion
//#region ../../packages/subdivide/src/PaneContextMenu.svelte
function PaneContextMenu($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { x, y, items, paneId, zone, onclose } = $$props;
		$$renderer.push(`<div class="menu-backdrop svelte-4zpxcf" role="presentation"><ul class="menu svelte-4zpxcf" role="menu"${attr_style("", {
			left: `${stringify(x)}px`,
			top: `${stringify(y)}px`
		})}><!--[-->`);
		const each_array = ensure_array_like(items);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let action = each_array[$$index];
			if (isPaneMenuSeparator(action)) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<li class="separator svelte-4zpxcf" role="separator" aria-hidden="true"></li>`);
			} else {
				$$renderer.push("<!--[-1-->");
				$$renderer.push(`<li role="none" class="svelte-4zpxcf"><button type="button" role="menuitem"${attr("disabled", action.disabled, true)} class="svelte-4zpxcf">${escape_html(action.label)}</button></li>`);
			}
			$$renderer.push(`<!--]-->`);
		}
		$$renderer.push(`<!--]--></ul></div>`);
	});
}
//#endregion
//#region ../../packages/subdivide/src/Subdivide.svelte
function Subdivide($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { layout = void 0, zones, zoneLabels, thickness = "1px", padding = "6px", color = "white", onlayoutchange, onopen, onclose, zoneContextMenus, onpanecontextmenu } = $$props;
		let panes = [];
		let dividers = [];
		let usedIds = /* @__PURE__ */ new Set();
		let dragging = null;
		let modifierPressed = false;
		let layoutTick = 0;
		let contextMenu = null;
		const hasPaneMenus = derived(() => zoneContextMenus !== void 0 || onpanecontextmenu !== void 0);
		const resolvedZoneLabels = derived(() => zoneLabels ?? Object.fromEntries(Object.keys(zones).map((k) => [k, k])));
		const availableZones = derived(() => Object.keys(zones));
		function bumpLayout() {
			layoutTick++;
		}
		function lockUserSelect() {
			document.body.style.userSelect;
			document.body.style.userSelect = "none";
		}
		function startDrag(divider, event) {
			event.preventDefault();
			event.stopPropagation();
			lockUserSelect();
			dragging = divider;
		}
		function handleZoneChange(pane, zone) {
			pane.zone = zone;
			bumpLayout();
			panes = [...panes];
		}
		function closeContextMenu() {
			contextMenu = null;
		}
		function paneCenterClient(pane) {
			return {
				clientX: 0,
				clientY: 0
			};
		}
		function buildBuiltinActions(pane) {
			const center = paneCenterClient(pane);
			const zoneChangeActions = availableZones().map((zoneKey) => ({
				id: `pane-zone-${zoneKey}`,
				label: resolvedZoneLabels()[zoneKey] ?? zoneKey,
				disabled: zoneKey === pane.zone,
				run: () => handleZoneChange(pane, zoneKey)
			}));
			return [
				{
					id: "split-north",
					label: "Split north",
					run: () => ({ ...center }, void 0)
				},
				{
					id: "split-south",
					label: "Split south",
					run: () => ({ ...center }, void 0)
				},
				{
					id: "split-east",
					label: "Split east",
					run: () => (EAST, { ...center }, void 0)
				},
				{
					id: "split-west",
					label: "Split west",
					run: () => ({ ...center }, void 0)
				},
				paneMenuSeparator(),
				...zoneChangeActions,
				paneMenuSeparator(),
				{
					id: "close-pane",
					label: "Close pane",
					run: () => closePane(pane)
				}
			];
		}
		function mergeDivider(divider) {
			const prev = divider.prev;
			const next = divider.next;
			if (!prev || !next) return;
			const prevSize = isPaneData(prev) ? prev.size : 0;
			const victim = prevSize <= 0 ? prev : next;
			removeFromArray(divider.parent.dividers, divider);
			removeFromArray(dividers, divider);
			if (prevSize <= 0) {
				const mergedDivider = prev.prev;
				next.prev = mergedDivider;
				if (mergedDivider && "next" in mergedDivider) mergedDivider.next = next;
			} else {
				const mergedDivider = next.next;
				prev.next = mergedDivider;
				if (mergedDivider && "prev" in mergedDivider) mergedDivider.prev = prev;
			}
			if (isPaneData(victim)) {
				victim.destroy(panes, dividers);
				usedIds.delete(victim.id);
				if (victim.parent) removeFromArray(victim.parent.children, victim);
				onclose?.({
					pane: victim,
					layout
				});
			} else victim.destroy(panes, dividers);
			bumpLayout();
		}
		function closePane(pane) {
			if (pane.next instanceof DividerData) {
				const divider = pane.next;
				const next = divider.next;
				if (!next || !isPaneData(next)) return;
				divider.position = pane.pos;
				pane.setRange(pane.pos, pane.pos);
				next.setRange(pane.pos, next.pos + next.size);
				mergeDivider(divider);
				return;
			}
			if (pane.prev instanceof DividerData) {
				const divider = pane.prev;
				const prev = divider.prev;
				if (!prev || !isPaneData(prev)) return;
				const collapsePos = pane.pos + pane.size;
				divider.position = collapsePos;
				pane.setRange(collapsePos, collapsePos);
				prev.setRange(prev.pos, collapsePos);
				mergeDivider(divider);
			}
		}
		function handlePaneContextMenu(pane, event) {
			if (onpanecontextmenu) {
				onpanecontextmenu({
					paneId: pane.id,
					zone: pane.zone,
					clientX: event.clientX,
					clientY: event.clientY
				});
				return;
			}
			if (!zoneContextMenus) return;
			contextMenu = {
				pane,
				x: event.clientX,
				y: event.clientY,
				items: composePaneMenu(pane.zone, zoneContextMenus, buildBuiltinActions(pane))
			};
		}
		$$renderer.push(`<div class="clip svelte-1c8tw0w"><div class="layout svelte-1c8tw0w"${attr_style(`--thickness: ${stringify(thickness)}; --draggable: calc(${stringify(thickness)} + ${stringify(padding)}); --color: ${stringify(color)}; --subdivide-menu-color: #4a6fa5; --subdivide-menu-bg: #2a3142`)}><!--[-->`);
		const each_array = ensure_array_like(panes);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let pane = each_array[$$index];
			Pane($$renderer, {
				pane,
				layoutTick,
				modifierPressed,
				zones,
				zoneLabels: resolvedZoneLabels(),
				availableZones: availableZones(),
				onsplit: (event) => void 0,
				onzonechange: (zone) => handleZoneChange(pane, zone),
				oncontextmenu: hasPaneMenus() ? (event) => handlePaneContextMenu(pane, event) : void 0
			});
		}
		$$renderer.push(`<!--]--> <!--[-->`);
		const each_array_1 = ensure_array_like(dividers);
		for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
			let divider = each_array_1[$$index_1];
			Divider($$renderer, {
				divider,
				layoutTick,
				onmousedown: (event) => startDrag(divider, event)
			});
		}
		$$renderer.push(`<!--]--> `);
		if (dragging) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<div${attr_class(`overlay ${stringify(dragging.type)} `, "svelte-1c8tw0w")} role="presentation" aria-hidden="true"></div>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		if (contextMenu) {
			$$renderer.push("<!--[0-->");
			PaneContextMenu($$renderer, {
				x: contextMenu.x,
				y: contextMenu.y,
				items: contextMenu.items,
				paneId: contextMenu.pane.id,
				zone: contextMenu.pane.zone,
				onclose: closeContextMenu
			});
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div></div>`);
		bind_props($$props, { layout });
	});
}
//#endregion
//#region ../../packages/graph-editor/src/CpuPreviewPanel.svelte
function CpuPreviewPanel($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { graph, output, size = 64, refreshEpoch = 0 } = $$props;
		$$renderer.push(`<div class="preview svelte-15pldyy"><h2 class="title svelte-15pldyy">CPU preview</h2> `);
		if (output) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<canvas${attr("width", size)}${attr("height", size)} class="heatmap svelte-15pldyy"></canvas>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<p class="empty svelte-15pldyy">Wire a scalar output to preview.</p>`);
		}
		$$renderer.push(`<!--]--></div>`);
	});
}
var MATH_ABS_MODULE = {
	id: "math.abs",
	source: `fn abs(x: f32) -> f32 {
	return select(-x, x, x >= 0.0);
}`
};
var MATH_ADD_MODULE = {
	id: "math.add",
	source: `fn add(a: f32, b: f32) -> f32 {
	return a + b;
}`
};
var MATH_BIAS_MODULE = {
	id: "math.bias",
	source: `fn bias(x: f32, bias: f32) -> f32 {
	return x / ((1.0 / bias - 2.0) * (1.0 - x) + 1.0);
}`
};
var MATH_CLAMP_MODULE = {
	id: "math.clamp",
	source: `fn clamp(x: f32, min: f32, max: f32) -> f32 {
	return min(max, max(min, x));
}`
};
var MATH_GAIN_MODULE = {
	id: "math.gain",
	dependencies: ["math.bias"],
	source: `fn gain(x: f32, gain: f32) -> f32 {
	if (x < 0.5) {
		return 0.5 * bias(2.0 * x, gain);
	}
	return 0.5 + 0.5 * bias(2.0 * x - 1.0, 1.0 - gain);
}`
};
var MATH_MIX_MODULE = {
	id: "math.mix",
	source: `fn mix(a: f32, b: f32, t: f32) -> f32 {
	return a + (b - a) * t;
}`
};
var MATH_MULTIPLY_MODULE = {
	id: "math.multiply",
	source: `fn multiply(a: f32, b: f32) -> f32 {
	return a * b;
}`
};
var MATH_POW_MODULE = {
	id: "math.pow",
	source: `fn pow(x: f32, exponent: f32) -> f32 {
	if (x == 0.0) {
		return 0.0;
	}
	if (x < 0.0) {
		let iexp = i32(round(exponent));
		if (abs(exponent - f32(iexp)) > 1e-5) {
			return 0.0 / 0.0;
		}
		let mag = exp(f32(iexp) * log(-x));
		return select(mag, -mag, (iexp & 1) != 0);
	}
	return exp(exponent * log(x));
}`
};
var MATH_REMAP_MODULE = {
	id: "math.remap",
	source: `fn remap(x: f32, inMin: f32, inMax: f32, outMin: f32, outMax: f32) -> f32 {
	let t = (x - inMin) / (inMax - inMin);
	return outMin + t * (outMax - outMin);
}`
};
var MATH_SMOOTHSTEP_MODULE = {
	id: "math.smoothstep",
	source: `fn smoothstep(x: f32, edge0: f32, edge1: f32) -> f32 {
	let t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
	return t * t * (3.0 - 2.0 * t);
}`
};
var NOISE_FBM_MODULE = {
	id: "noise.fbm",
	source: `fn fbm(position: vec3<f32>, octaves: f32, persistence: f32, lacunarity: f32) -> f32 {
	var value = 0.0;
	var amplitude = 1.0;
	var frequency = 1.0;
	var maxValue = 0.0;
	let octaveCount = i32(octaves);
	for (var i = 0; i < octaveCount; i = i + 1) {
		value = value + amplitude * perlin3d(position * frequency);
		maxValue = maxValue + amplitude;
		amplitude = amplitude * persistence;
		frequency = frequency * lacunarity;
	}
	return value / maxValue;
}`,
	dependencies: ["noise.perlin3d"]
};
//#endregion
//#region ../../packages/procedural-wgsl/src/modules/noise/perlin3d.ts
/** Deterministic Fisher–Yates shuffle — mirrors `packages/graph/src/primitives/perlin3d.ts`. */
function buildPermutationTable$1() {
	const base = new Uint8Array(256);
	for (let i = 0; i < 256; i++) base[i] = i;
	let seed = 1315423911;
	for (let i = 255; i > 0; i--) {
		seed = seed * 1664525 + 1013904223 >>> 0;
		const j = seed % (i + 1);
		const tmp = base[i];
		base[i] = base[j];
		base[j] = tmp;
	}
	const p = new Array(512);
	for (let i = 0; i < 512; i++) p[i] = base[i & 255];
	return p;
}
function formatPermArray$1(values) {
	const lines = [];
	for (let i = 0; i < values.length; i += 16) lines.push("	" + values.slice(i, i + 16).join(", ") + ",");
	return lines.join("\n");
}
var NOISE_PERLIN3D_MODULE = {
	id: "noise.perlin3d",
	source: `const PERM: array<u32, 512> = array<u32, 512>(
${formatPermArray$1(buildPermutationTable$1())}
);

fn perlin_fade(t: f32) -> f32 {
	return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

fn perlin_grad(hash: u32, x: f32, y: f32, z: f32) -> f32 {
	let h = hash & 15u;
	let u = select(y, x, h < 8u);
	let v = select(select(z, x, h == 12u || h == 14u), y, h < 4u);
	let u_term = select(-u, u, (h & 1u) == 0u);
	let v_term = select(-v, v, (h & 2u) == 0u);
	return u_term + v_term;
}

fn perlin_lerp(a: f32, b: f32, t: f32) -> f32 {
	return a + t * (b - a);
}

fn perlin3d(position: vec3<f32>) -> f32 {
	let x = position.x;
	let y = position.y;
	let z = position.z;
	let xi = u32(floor(x)) & 255u;
	let yi = u32(floor(y)) & 255u;
	let zi = u32(floor(z)) & 255u;
	let xf = x - floor(x);
	let yf = y - floor(y);
	let zf = z - floor(z);
	let u = perlin_fade(xf);
	let v = perlin_fade(yf);
	let w = perlin_fade(zf);

	let aaa = PERM[PERM[PERM[xi] + yi] + zi];
	let aba = PERM[PERM[PERM[xi] + yi + 1u] + zi];
	let aab = PERM[PERM[PERM[xi] + yi] + zi + 1u];
	let abb = PERM[PERM[PERM[xi] + yi + 1u] + zi + 1u];
	let baa = PERM[PERM[PERM[xi + 1u] + yi] + zi];
	let bba = PERM[PERM[PERM[xi + 1u] + yi + 1u] + zi];
	let bab = PERM[PERM[PERM[xi + 1u] + yi] + zi + 1u];
	let bbb = PERM[PERM[PERM[xi + 1u] + yi + 1u] + zi + 1u];

	let x1 = perlin_lerp(
		perlin_grad(aaa, xf, yf, zf),
		perlin_grad(baa, xf - 1.0, yf, zf),
		u
	);
	let x2 = perlin_lerp(
		perlin_grad(aba, xf, yf - 1.0, zf),
		perlin_grad(bba, xf - 1.0, yf - 1.0, zf),
		u
	);
	let y1 = perlin_lerp(x1, x2, v);

	let x3 = perlin_lerp(
		perlin_grad(aab, xf, yf, zf - 1.0),
		perlin_grad(bab, xf - 1.0, yf, zf - 1.0),
		u
	);
	let x4 = perlin_lerp(
		perlin_grad(abb, xf, yf - 1.0, zf - 1.0),
		perlin_grad(bbb, xf - 1.0, yf - 1.0, zf - 1.0),
		u
	);
	let y2 = perlin_lerp(x3, x4, v);

	return perlin_lerp(y1, y2, w);
}`
};
var NOISE_RIDGED_FBM_MODULE = {
	id: "noise.ridgedFbm",
	source: `fn ridgedFbm(position: vec3<f32>, octaves: f32, persistence: f32, lacunarity: f32, offset: f32) -> f32 {
	var value = 0.0;
	var amplitude = 1.0;
	var frequency = 1.0;
	var weight = 1.0;
	let octaveCount = i32(octaves);
	for (var i = 0; i < octaveCount; i = i + 1) {
		var signal = offset - abs(perlin3d(position * frequency));
		signal = signal * signal;
		signal = signal * weight;
		weight = min(1.0, signal * 2.0);
		value = value + signal * amplitude;
		amplitude = amplitude * persistence;
		frequency = frequency * lacunarity;
	}
	return value;
}`,
	dependencies: ["noise.perlin3d"]
};
//#endregion
//#region ../../packages/procedural-wgsl/src/modules/noise/simplex.ts
/** Deterministic Fisher–Yates shuffle — mirrors `packages/graph/src/primitives/simplex.ts`. */
function buildPermutationTable() {
	const base = new Uint8Array(256);
	for (let i = 0; i < 256; i++) base[i] = i;
	let seed = 1315423911;
	for (let i = 255; i > 0; i--) {
		seed = seed * 1664525 + 1013904223 >>> 0;
		const j = seed % (i + 1);
		const tmp = base[i];
		base[i] = base[j];
		base[j] = tmp;
	}
	const p = new Array(512);
	for (let i = 0; i < 512; i++) p[i] = base[i & 255];
	return p;
}
function formatPermArray(values) {
	const lines = [];
	for (let i = 0; i < values.length; i += 16) lines.push("	" + values.slice(i, i + 16).join(", ") + ",");
	return lines.join("\n");
}
var NOISE_SIMPLEX_MODULE = {
	id: "noise.simplex",
	source: `const SIMPLEX_PERM: array<u32, 512> = array<u32, 512>(
${formatPermArray(buildPermutationTable())}
);

const SIMPLEX_F3: f32 = 1.0 / 3.0;
const SIMPLEX_G3: f32 = 1.0 / 6.0;

fn simplex_grad3(gi: u32) -> vec3<f32> {
	switch (gi % 12u) {
		case 0u: { return vec3<f32>(1.0, 1.0, 0.0); }
		case 1u: { return vec3<f32>(-1.0, 1.0, 0.0); }
		case 2u: { return vec3<f32>(1.0, -1.0, 0.0); }
		case 3u: { return vec3<f32>(-1.0, -1.0, 0.0); }
		case 4u: { return vec3<f32>(1.0, 0.0, 1.0); }
		case 5u: { return vec3<f32>(-1.0, 0.0, 1.0); }
		case 6u: { return vec3<f32>(1.0, 0.0, -1.0); }
		case 7u: { return vec3<f32>(-1.0, 0.0, -1.0); }
		case 8u: { return vec3<f32>(0.0, 1.0, 1.0); }
		case 9u: { return vec3<f32>(0.0, -1.0, 1.0); }
		case 10u: { return vec3<f32>(0.0, 1.0, -1.0); }
		default: { return vec3<f32>(0.0, -1.0, -1.0); }
	}
}

fn simplex_contrib(x: f32, y: f32, z: f32, gi: u32) -> f32 {
	let t = 0.6 - x * x - y * y - z * z;
	if (t < 0.0) {
		return 0.0;
	}
	let g = simplex_grad3(gi);
	return t * t * t * t * dot(g, vec3<f32>(x, y, z));
}

fn simplex3d(position: vec3<f32>) -> f32 {
	let x = position.x;
	let y = position.y;
	let z = position.z;
	let s = (x + y + z) * SIMPLEX_F3;
	let i = i32(floor(x + s));
	let j = i32(floor(y + s));
	let k = i32(floor(z + s));
	let t = f32(i + j + k) * SIMPLEX_G3;
	let x0 = x - (f32(i) - t);
	let y0 = y - (f32(j) - t);
	let z0 = z - (f32(k) - t);

	var i1 = 0;
	var j1 = 0;
	var k1 = 0;
	var i2 = 0;
	var j2 = 0;
	var k2 = 0;

	if (x0 >= y0) {
		if (y0 >= z0) {
			i1 = 1; j1 = 0; k1 = 0;
			i2 = 1; j2 = 1; k2 = 0;
		} else if (x0 >= z0) {
			i1 = 1; j1 = 0; k1 = 0;
			i2 = 1; j2 = 0; k2 = 1;
		} else {
			i1 = 0; j1 = 0; k1 = 1;
			i2 = 1; j2 = 0; k2 = 1;
		}
	} else if (y0 < z0) {
		i1 = 0; j1 = 0; k1 = 1;
		i2 = 0; j2 = 1; k2 = 1;
	} else if (x0 < z0) {
		i1 = 0; j1 = 1; k1 = 0;
		i2 = 0; j2 = 1; k2 = 1;
	} else {
		i1 = 0; j1 = 1; k1 = 0;
		i2 = 1; j2 = 1; k2 = 0;
	}

	let ii = u32(i) & 255u;
	let jj = u32(j) & 255u;
	let kk = u32(k) & 255u;

	let gi0 = SIMPLEX_PERM[ii + SIMPLEX_PERM[jj + SIMPLEX_PERM[kk]]] % 12u;
	let gi1 = SIMPLEX_PERM[ii + u32(i1) + SIMPLEX_PERM[jj + u32(j1) + SIMPLEX_PERM[kk + u32(k1)]]] % 12u;
	let gi2 = SIMPLEX_PERM[ii + u32(i2) + SIMPLEX_PERM[jj + u32(j2) + SIMPLEX_PERM[kk + u32(k2)]]] % 12u;
	let gi3 = SIMPLEX_PERM[ii + 1u + SIMPLEX_PERM[jj + 1u + SIMPLEX_PERM[kk + 1u]]] % 12u;

	let n0 = simplex_contrib(x0, y0, z0, gi0);
	let n1 = simplex_contrib(x0 - f32(i1) + SIMPLEX_G3, y0 - f32(j1) + SIMPLEX_G3, z0 - f32(k1) + SIMPLEX_G3, gi1);
	let n2 = simplex_contrib(x0 - f32(i2) + 2.0 * SIMPLEX_G3, y0 - f32(j2) + 2.0 * SIMPLEX_G3, z0 - f32(k2) + 2.0 * SIMPLEX_G3, gi2);
	let n3 = simplex_contrib(x0 - 1.0 + 3.0 * SIMPLEX_G3, y0 - 1.0 + 3.0 * SIMPLEX_G3, z0 - 1.0 + 3.0 * SIMPLEX_G3, gi3);

	return 32.0 * (n0 + n1 + n2 + n3);
}`
};
var NOISE_WORLEY_MODULE = {
	id: "noise.worley",
	source: `fn worley_hash3(ix: i32, iy: i32, iz: i32) -> f32 {
	var n: u32 = u32(ix * 374761393 + iy * 668265263 + iz * 1274126177);
	n = (n ^ (n >> 13u)) * 1274126177u;
	n = n ^ (n >> 16u);
	return f32(n & 65535u) / 65535.0;
}

fn worley(position: vec3<f32>) -> f32 {
	let x = position.x;
	let y = position.y;
	let z = position.z;
	let xi = i32(floor(x));
	let yi = i32(floor(y));
	let zi = i32(floor(z));
	let xf = x - floor(x);
	let yf = y - floor(y);
	let zf = z - floor(z);

	var minDist = 1.0;
	for (var k = -1; k <= 1; k = k + 1) {
		for (var j = -1; j <= 1; j = j + 1) {
			for (var i = -1; i <= 1; i = i + 1) {
				let fp_x = worley_hash3(xi + i, yi + j, zi + k);
				let fp_y = worley_hash3(yi + j, zi + k, xi + i);
				let fp_z = worley_hash3(zi + k, xi + i, yi + j);
				let dx = f32(i) + fp_x - xf;
				let dy = f32(j) + fp_y - yf;
				let dz = f32(k) + fp_z - zf;
				let dist = sqrt(dx * dx + dy * dy + dz * dz);
				minDist = min(minDist, dist);
			}
		}
	}
	return minDist;
}`
};
var PROCEDURAL_METRIC_POSITION_MODULE = {
	id: "procedural.metricPosition",
	source: `// metricPosition is a consumer-injected stub.
// Consumers (e.g., vegetation compute) override this function body
// with their own world-space position calculation.
fn metricPosition() -> vec3<f32> {
	return vec3<f32>(0.0, 0.0, 0.0);
}`
};
var PROCEDURAL_UV_MODULE = {
	id: "procedural.uv",
	source: `fn uv(u: f32, v: f32) -> vec2<f32> {
	return vec2<f32>(u, v);
}`
};
var SURFACE_CUBE_SPHERE_MODULE = {
	id: "surface.cubeSphere",
	source: `fn cubeFaceUvToPoint(face: i32, u: f32, v: f32) -> vec3<f32> {
	let s = u * 2.0 - 1.0;
	let t = v * 2.0 - 1.0;
	switch face {
		case 0: { return vec3<f32>(1.0, t, -s); }
		case 1: { return vec3<f32>(-1.0, t, s); }
		case 2: { return vec3<f32>(s, 1.0, -t); }
		case 3: { return vec3<f32>(s, -1.0, t); }
		case 4: { return vec3<f32>(s, t, 1.0); }
		case 5: { return vec3<f32>(-s, t, -1.0); }
		default: { return vec3<f32>(0.0, 0.0, 1.0); }
	}
}

fn normalize3(v: vec3<f32>) -> vec3<f32> {
	let len = length(v);
	if (len == 0.0) {
		return vec3<f32>(0.0, 0.0, 1.0);
	}
	return v / len;
}

fn cubeSphere(uv: vec2<f32>, face: i32) -> vec3<f32> {
	return normalize3(cubeFaceUvToPoint(face, uv.x, uv.y));
}`
};
var SURFACE_PLANE_MODULE = {
	id: "surface.plane",
	source: `fn plane(uv: vec2<f32>) -> vec3<f32> {
	return vec3<f32>(2.0 * uv.x - 1.0, 2.0 * uv.y - 1.0, 0.0);
}

fn plane_normal(_uv: vec2<f32>) -> vec3<f32> {
	return vec3<f32>(0.0, 0.0, 1.0);
}`
};
//#endregion
//#region ../../packages/procedural-wgsl/src/modules/terrain/wgslSnippets.ts
/** Verbatim planet WGSL fragments (copied from fe/src/lib/planet/gpu/wgsl — do not rewrite math). */
var HASH_WGSL = `fn hash3(x: vec3f) -> vec3f {
  let p = vec3f(
    dot(x, vec3f(127.1, 311.7, 74.7)),
    dot(x, vec3f(269.5, 183.3, 246.1)),
    dot(x, vec3f(113.5, 271.9, 124.6))
  );
  return fract(sin(p) * 43758.5453123);
}`;
var FBM_WGSL = `fn mod289_f(x: f32) -> f32 { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289_v4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn perm_v4(x: vec4f) -> vec4f { return mod289_v4((x * 34.0 + 1.0) * x); }

fn noise3(p: vec3f) -> f32 {
  let a = floor(p);
  var d = p - a;
  d = d * d * (3.0 - 2.0 * d);
  let b = a.xxyy + vec4f(0.0, 1.0, 0.0, 1.0);
  let k1 = perm_v4(b.xyxy);
  let k2 = perm_v4(k1.xyxy + b.zzww);
  let c = k2 + a.zzzz;
  let k3 = perm_v4(c);
  let k4 = perm_v4(c + 1.0);
  let o1 = fract(k3 * (1.0 / 41.0));
  let o2 = fract(k4 * (1.0 / 41.0));
  let o3 = o2 * d.z + o1 * (1.0 - d.z);
  let o4 = o3.yw * d.x + o3.xz * (1.0 - d.x);
  return o4.y * d.y + o4.x * (1.0 - d.y);
}

const M3: mat3x3f = mat3x3f(
  vec3f(0.00, 0.80, 0.60),
  vec3f(-0.80, 0.36, -0.48),
  vec3f(-0.60, -0.48, 0.64)
);

fn fbm_4(x: vec3f) -> f32 {
  var p = x;
  var f = 2.0;
  let s = 0.5;
  var a = 0.0;
  var b = 0.5;
  for (var i = 0; i < 4; i++) {
    let n = noise3(p);
    a += b * n;
    b *= s;
    p = f * M3 * p;
  }
  return a;
}`;
var VORONOI_WGSL = `fn voronoi3(x: vec3f) -> vec3f {
  let p = floor(x);
  let f = fract(x);
  var id = 0.0;
  var res = vec2f(100.0);
  for (var k = -1; k <= 1; k++) {
    for (var j = -1; j <= 1; j++) {
      for (var i = -1; i <= 1; i++) {
        let b = vec3f(f32(i), f32(j), f32(k));
        let r = b - f + hash3(p + b);
        let d = dot(r, r);
        if (d < res.x) {
          id = dot(p + b, vec3f(1.0, 57.0, 113.0));
          res = vec2f(d, res.x);
        } else if (d < res.y) {
          res.y = d;
        }
      }
    }
  }
  return vec3f(sqrt(res), abs(id));
}`;
var PLANET_TYPES_WGSL = `struct PlanetSample {
  unit_dir: vec3f,
  height_meters: f32,
  water_height_meters: f32,
  world_radius_meters: f32,
  distortion: f32,
  vor: vec3f,
  detail: f32,
  erosion_value: f32,
  world_pos: vec3f,
}

struct ScaleContext {
  camera_altitude_meters: f32,
  distance_to_camera_meters: f32,
  meters_per_pixel: f32,
  max_feature_frequency: f32,
  mode: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
}

struct PlanetParams {
  radius: f32,
  voronoi_scale: f32,
  voronoi_amplitude: f32,
  voronoi_albedo: f32,
  voronoi_albedo_y: f32,
  voronoi_albedo_z: f32,
  voronoi_distortion_scale: f32,
  voronoi_distortion_amplitude: f32,
  voronoi_distortion_albedo: f32,
  detail_scale: f32,
  detail_amplitude: f32,
  detail_albedo: f32,
  water_level: f32,
  render_water: f32,
  erosion: f32,
  sand_cutoff: f32,
  vegetation_level: f32,
  snow_cover: f32,
  texture_noise_scale: f32,
  texture_noise_amplitude: f32,
  polar_scale: f32,
  polar_amplitude: f32,
  illumination: f32,
  time: f32,
  _pad0: f32,
  _pad1: f32,
  _pad2: f32,
}`;
var KERNEL_HELPERS_WGSL = `fn should_eval_layer(min_mpp_ratio: f32, scale: ScaleContext, radius: f32) -> bool {
  return scale.meters_per_pixel <= min_mpp_ratio * radius;
}

fn rotate_vector_by_quat(q: vec4f, v: vec3f) -> vec3f {
  let temp = cross(q.xyz, v) + q.w * v;
  return v + 2.0 * cross(q.xyz, temp);
}

fn rotate_vector_by_quat_inv(q: vec4f, v: vec3f) -> vec3f {
  let temp = cross(-q.xyz, v) + q.w * v;
  return v + 2.0 * cross(-q.xyz, temp);
}`;
var SAMPLE_PLANET_WGSL = `fn sample_planet(unit_dir: vec3f, params: PlanetParams, scale: ScaleContext) -> PlanetSample {
  var p = unit_dir;
  var r: PlanetSample;
  r.unit_dir = unit_dir;

  let v_amp = params.voronoi_amplitude * params.radius;
  let d_amp = params.detail_amplitude * params.radius;
  let total_amplitude = v_amp + d_amp;
  let wl = total_amplitude * (params.water_level - 0.5);

  var distortion = 0.0;
  if (should_eval_layer(5.0, scale, params.radius) && params.voronoi_distortion_scale > 0.0) {
    distortion = fbm_4(p * params.voronoi_distortion_scale);
  }
  r.distortion = distortion;

  var vor = vec3f(0.5);
  if (should_eval_layer(10.0, scale, params.radius)) {
    vor = voronoi3(p * params.voronoi_scale + (distortion - 0.5) * params.voronoi_distortion_amplitude);
  }
  r.vor = vor;

  var detail = 0.5;
  if (should_eval_layer(0.5, scale, params.radius) && params.detail_scale > 0.0) {
    detail = fbm_4(p * params.detail_scale);
  }
  r.detail = detail;

  var height = (vor.x - 0.5) * v_amp + (detail - 0.5) * d_amp;
  var th = height - wl;
  var thf: f32;
  if (th > 0.0) {
    thf = total_amplitude - wl;
  } else {
    thf = wl - params.radius;
  }
  th /= thf;
  th = pow(th, params.erosion);
  r.erosion_value = th;
  th *= thf;
  height = wl + th;
  r.height_meters = height;
  r.water_height_meters = wl;

  var radius = params.radius + height;
  r.world_radius_meters = radius;
  r.world_pos = p * radius;
  return r;
}`;
var MATERIAL_TYPES_WGSL = `struct BiomeProps {
  roughness: f32,
  metallic: f32,
  ior: f32,
}

struct SurfaceMaterial {
  albedo: vec3f,
  roughness: f32,
  metallic: f32,
  ior: f32,
  biome_id: u32,
}

struct MaterialOverrides {
  exposure: f32,
  roughness_mult: f32,
  water_gloss: f32,
  material_debug: f32,
  fog_density: f32,
  shadows_enabled: f32,
  shadow_fill: f32,
  object_opacity: f32,
  height_blend: f32,
  displacement_blend: f32,
  shadow_softness: f32,
  shadow_steps: f32,
}`;
var TERRAIN_BIOME_MATERIAL_MODULE = {
	id: "terrain.biomeMaterial",
	source: `/*---
id: terrain.biomeMaterial
entry: biomeMaterial
category: Material
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${PLANET_TYPES_WGSL}
${MATERIAL_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}
const ROCK: vec3f = vec3f(0.50, 0.35, 0.15);
const TREE: vec3f = vec3f(0.05, 1.15, 0.10);
const SAND: vec3f = vec3f(1.00, 1.00, 0.85);
const ICE: vec3f = vec3f(0.85, 1.00, 1.20);

const BIOME_ROCK: u32 = 0u;
const BIOME_VEGETATION: u32 = 1u;
const BIOME_SAND: u32 = 2u;
const BIOME_WATER: u32 = 3u;
const BIOME_ICE: u32 = 4u;

fn biome_props(biome_id: u32) -> BiomeProps {
  switch (biome_id) {
    case BIOME_VEGETATION: { return BiomeProps(0.8, 0.0, 1.0); }
    case BIOME_SAND: { return BiomeProps(0.6, 0.0, 1.0); }
    case BIOME_WATER: { return BiomeProps(0.06, 0.0, 1.33); }
    case BIOME_ICE: { return BiomeProps(0.3, 0.0, 1.31); }
    default: { return BiomeProps(0.9, 0.0, 1.0); }
  }
}

fn biomeMaterial(sample: PlanetSample, params: PlanetParams, scale: ScaleContext) -> SurfaceMaterial {
  var spots = sample.vor.x * (1.0 - params.voronoi_albedo) + params.voronoi_albedo;
  spots *= sample.vor.y * (1.0 - params.voronoi_albedo_y) + params.voronoi_albedo_y;
  spots *= sample.vor.z * (1.0 - params.voronoi_albedo_z) + params.voronoi_albedo_z;
  spots *= sample.distortion * (1.0 - params.voronoi_distortion_albedo) + params.voronoi_distortion_albedo;
  spots *= sample.detail * (1.0 - params.detail_albedo) + params.detail_albedo;

  var col = ROCK * vec3f(spots);
  var biome_id = BIOME_ROCK;
  let tex_amp = params.texture_noise_amplitude * params.radius;
  let polar_amp = params.polar_amplitude * params.radius;
  let total_amplitude = (params.voronoi_amplitude + params.detail_amplitude) * params.radius;

  var tn = 0.0;
  if (should_eval_layer(0.05, scale, params.radius) && params.texture_noise_scale > 0.0) {
    tn = (fbm_4(sample.unit_dir * 100.0 * sqrt(params.texture_noise_scale)) - 0.5) * tex_amp;
  }
  var polar = 0.0;
  if (should_eval_layer(2.0, scale, params.radius)) {
    polar = ((abs(sample.world_pos.y) / params.radius) - params.polar_scale) * polar_amp;
  }
  let h = sample.height_meters + tn + polar;
  let tl = h / total_amplitude;
  let wl = total_amplitude * (params.water_level - 0.5);

  if (tl < pow(params.vegetation_level, 2.0)) {
    col = TREE * vec3f(spots);
    biome_id = BIOME_VEGETATION;
  }
  if (tl < pow(params.sand_cutoff, 2.0)) {
    col = SAND * vec3f(spots);
    biome_id = BIOME_SAND;
  }
  if (tl > pow(params.snow_cover, 2.0)) {
    col = ICE + vec3f(tl);
    biome_id = BIOME_ICE;
    col *= vec3f(spots);
  }

  let props = biome_props(biome_id);
  var roughness = props.roughness;
  if (should_eval_layer(0.05, scale, params.radius)) {
    let micro = (sample.detail - 0.5) * 0.25 + (tn / max(tex_amp, 0.001)) * 0.1;
    roughness = clamp(roughness + micro, 0.02, 1.0);
  }

  return SurfaceMaterial(col, roughness, props.metallic, props.ior, biome_id);
}`
};
var SURFACE_CUBE_FACE_DIR_MODULE = {
	id: "surface.cubeFaceDir",
	source: `/*---
id: surface.cubeFaceDir
entry: cubeFaceDir
category: Surface
group: Domain
---*/
fn cube_face_uv_to_unit_dir(face: u32, u: f32, v: f32) -> vec3f {
  let a = u * 2.0 - 1.0;
  let b = v * 2.0 - 1.0;
  var pos = vec3f(0.0, 0.0, 1.0);
  switch (face) {
    case 0u: { pos = vec3f(1.0, b, -a); }
    case 1u: { pos = vec3f(-1.0, b, a); }
    case 2u: { pos = vec3f(a, 1.0, -b); }
    case 3u: { pos = vec3f(a, -1.0, b); }
    case 4u: { pos = vec3f(a, b, 1.0); }
    default: { pos = vec3f(-a, b, -1.0); }
  }
  return normalize(pos);
}

fn cubeFaceDir(face: u32, u: f32, v: f32) -> vec3f {
  return cube_face_uv_to_unit_dir(face, u, v);
}`
};
var TERRAIN_DETAIL_FBM_MODULE = {
	id: "terrain.detailFbm",
	source: `/*---
id: terrain.detailFbm
entry: detailFbm
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}

fn detailFbm(unit_dir: vec3f, scale: ScaleContext, params: PlanetParams) -> f32 {
  var detail = 0.5;
  if (should_eval_layer(0.5, scale, params.radius) && params.detail_scale > 0.0) {
    detail = fbm_4(unit_dir * params.detail_scale);
  }
  return detail;
}`
};
var TERRAIN_DOMAIN_WARP_MODULE = {
	id: "terrain.domainWarp",
	source: `/*---
id: terrain.domainWarp
entry: domainWarp
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}

fn domainWarp(unit_dir: vec3f, scale: ScaleContext, params: PlanetParams) -> f32 {
  var distortion = 0.0;
  if (should_eval_layer(5.0, scale, params.radius) && params.voronoi_distortion_scale > 0.0) {
    distortion = fbm_4(unit_dir * params.voronoi_distortion_scale);
  }
  return distortion;
}`
};
var TERRAIN_FINE_TEXTURE_NOISE_MODULE = {
	id: "terrain.fineTextureNoise",
	source: `/*---
id: terrain.fineTextureNoise
entry: fineTextureNoise
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}

fn fineTextureNoise(unit_dir: vec3f, scale: ScaleContext, params: PlanetParams) -> f32 {
  let tex_amp = params.texture_noise_amplitude * params.radius;
  var tn = 0.0;
  if (should_eval_layer(0.05, scale, params.radius) && params.texture_noise_scale > 0.0) {
    tn = (fbm_4(unit_dir * 100.0 * sqrt(params.texture_noise_scale)) - 0.5) * tex_amp;
  }
  return tn;
}`
};
var TERRAIN_HEIGHT_REMAP_MODULE = {
	id: "terrain.heightRemap",
	source: `/*---
id: terrain.heightRemap
entry: heightRemap
category: Terrain
group: Domain
---*/
${PLANET_TYPES_WGSL}

fn heightRemap(vor: vec3f, detail: f32, params: PlanetParams) -> f32 {
  let v_amp = params.voronoi_amplitude * params.radius;
  let d_amp = params.detail_amplitude * params.radius;
  let total_amplitude = v_amp + d_amp;
  let wl = total_amplitude * (params.water_level - 0.5);

  var height = (vor.x - 0.5) * v_amp + (detail - 0.5) * d_amp;
  var th = height - wl;
  var thf: f32;
  if (th > 0.0) {
    thf = total_amplitude - wl;
  } else {
    thf = wl - params.radius;
  }
  th /= thf;
  th = pow(th, params.erosion);
  th *= thf;
  height = wl + th;
  return params.radius + height;
}`
};
var TERRAIN_NORMAL_ESTIMATOR_MODULE = {
	id: "terrain.normalEstimator",
	source: `/*---
id: terrain.normalEstimator
entry: normalEstimator
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${VORONOI_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}
${SAMPLE_PLANET_WGSL}
fn sphere_tangent_frame(unit_dir: vec3f) -> mat3x3f {
  var up = vec3f(0.0, 1.0, 0.0);
  if (abs(dot(unit_dir, up)) > 0.95) {
    up = vec3f(1.0, 0.0, 0.0);
  }
  let east = normalize(cross(up, unit_dir));
  let north = cross(unit_dir, east);
  return mat3x3f(east, north, unit_dir);
}

fn normalEstimator(
  unit_dir: vec3f,
  params: PlanetParams,
  scale: ScaleContext,
) -> vec3f {
  let radius = max(params.radius, 1.0);
  let angular_eps = clamp(scale.meters_per_pixel / radius, 1e-6, 0.06);
  if (angular_eps >= 0.055) {
    return normalize(unit_dir);
  }

  let frame = sphere_tangent_frame(unit_dir);
  let east = frame[0];
  let north = frame[1];

  let h0 = sample_planet(unit_dir, params, scale).world_radius_meters;
  let dir_e = normalize(unit_dir + east * angular_eps);
  let dir_n = normalize(unit_dir + north * angular_eps);
  let h_e = sample_planet(dir_e, params, scale).world_radius_meters;
  let h_n = sample_planet(dir_n, params, scale).world_radius_meters;

  let p0 = unit_dir * h0;
  let p_e = dir_e * h_e;
  let p_n = dir_n * h_n;

  let tangent_e = p_e - p0;
  let tangent_n = p_n - p0;
  return normalize(cross(tangent_e, tangent_n));
}`
};
var MATERIAL_PBR_LIGHTING_MODULE = {
	id: "material.pbrLighting",
	source: `/*---
id: material.pbrLighting
entry: pbrLighting
category: Material
group: Domain
---*/
${MATERIAL_TYPES_WGSL}
const PI: f32 = 3.141592653589793;

fn fresnel_schlick(cos_theta: f32, f0: vec3f) -> vec3f {
  return f0 + (vec3f(1.0) - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

fn fresnel_schlick_roughness(cos_theta: f32, f0: vec3f, roughness: f32) -> vec3f {
  let max_r = max(vec3f(1.0 - roughness), f0);
  return f0 + (max_r - f0) * pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
}

fn f0_from_ior(ior: f32) -> vec3f {
  let f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  return vec3f(f0);
}

fn material_f0(material: SurfaceMaterial) -> vec3f {
  if (material.metallic > 0.5) {
    return material.albedo;
  }
  if (material.ior > 1.01) {
    return f0_from_ior(material.ior);
  }
  return vec3f(0.04);
}

fn distribution_ggx(n_dot_h: f32, roughness: f32) -> f32 {
  let a = roughness * roughness;
  let a2 = a * a;
  let denom = n_dot_h * n_dot_h * (a2 - 1.0) + 1.0;
  return a2 / max(PI * denom * denom, 1e-7);
}

fn geometry_schlick_ggx_direct(n_dot_x: f32, roughness: f32) -> f32 {
  let r = roughness + 1.0;
  let k = (r * r) / 8.0;
  return n_dot_x / max(n_dot_x * (1.0 - k) + k, 1e-4);
}

fn geometry_smith_direct(n_dot_v: f32, n_dot_l: f32, roughness: f32) -> f32 {
  return geometry_schlick_ggx_direct(n_dot_v, roughness) * geometry_schlick_ggx_direct(n_dot_l, roughness);
}

fn burley_diffuse(roughness: f32, n_dot_v: f32, n_dot_l: f32, v_dot_h: f32) -> f32 {
  let f90 = 0.5 + 2.0 * v_dot_h * v_dot_h * roughness;
  let light_scatter = 1.0 + (f90 - 1.0) * pow(1.0 - n_dot_l, 5.0);
  let view_scatter = 1.0 + (f90 - 1.0) * pow(1.0 - n_dot_v, 5.0);
  return light_scatter * view_scatter / PI;
}

fn brdf_specular_direct(
  n_dot_v: f32,
  n_dot_l: f32,
  n_dot_h: f32,
  v_dot_h: f32,
  roughness: f32,
  f0: vec3f,
) -> vec3f {
  let d = distribution_ggx(n_dot_h, roughness);
  let g = geometry_smith_direct(n_dot_v, n_dot_l, roughness);
  let f = fresnel_schlick(v_dot_h, f0);
  let denom = 4.0 * n_dot_v * n_dot_l + 1e-4;
  return (d * g * f) / denom;
}

fn env_brdf_approx(n_dot_v: f32, roughness: f32) -> vec2f {
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022);
  let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let r = roughness * c0 + c1;
  let a004 = min(r.x * r.x, exp2(-9.28 * n_dot_v)) * r.x + r.y;
  return vec2f(-1.04, 1.04) * a004 + vec2f(r.z, r.w);
}
const MAX_LIGHTS: u32 = 4u;

struct AtmosphereParams {
  planet_center: vec3f,
  planet_radius: f32,
  outer_radius: f32,
  scale_height: f32,
  mie_g: f32,
  ground_fog_density: f32,
  rayleigh_strength: f32,
  mie_strength: f32,
  sun_radiance: f32,
  fog_height: f32,
  integrate_steps: f32,
  _pad0: f32,
}

struct GpuLight {
  position_or_dir: vec4f,
  color: vec4f,
  params: vec4f,
}

struct LightingUniforms {
  ambient: vec4f,
  light_count: u32,
  _pad0: u32,
  _pad1: u32,
  _pad2: u32,
  lights: array<GpuLight, MAX_LIGHTS>,
}

struct LightingResult {
  color: vec3f,
  direct_spec: vec3f,
  ibl_spec: vec3f,
}

fn attenuate_point(light_pos: vec3f, surface_pos: vec3f, range: f32) -> f32 {
  let dist = length(light_pos - surface_pos);
  let range_clamped = max(range, 1.0);
  let atten = 1.0 / (dist * dist + 1.0);
  let range_factor = clamp(1.0 - pow(dist / range_clamped, 4.0), 0.0, 1.0);
  return atten * range_factor * range_factor;
}

fn primary_sun_dir(lighting: LightingUniforms) -> vec3f {
  if (lighting.light_count > 0u && lighting.lights[0].position_or_dir.w < 0.5) {
    return normalize(lighting.lights[0].position_or_dir.xyz);
  }
  return vec3f(1.0, 0.0, 0.0);
}

fn sun_hemisphere(nrm: vec3f, sun_dir: vec3f) -> f32 {
  return clamp(max(dot(nrm, sun_dir), 0.0), 0.0, 1.0);
}

fn sky_radiance(
  view_dir: vec3f,
  eye: vec3f,
  atmo: AtmosphereParams,
  sun_dir: vec3f,
) -> vec3f {
  let horizon = max(dot(view_dir, vec3f(0.0, 1.0, 0.0)), 0.0);
  let sun = max(dot(view_dir, sun_dir), 0.0);
  let eye_term = length(eye - atmo.planet_center) * 1e-6;
  return mix(vec3f(0.01, 0.02, 0.05), vec3f(0.35, 0.5, 0.85) * atmo.sun_radiance, horizon)
    + vec3f(sun * 0.15) + vec3f(eye_term);
}

fn sky_diffuse_irradiance(
  nrm: vec3f,
  eye: vec3f,
  atmo: AtmosphereParams,
  sun_dir: vec3f,
) -> vec3f {
  let up = max(dot(nrm, vec3f(0.0, 1.0, 0.0)), 0.0);
  let sky_n = sky_radiance(nrm, eye, atmo, sun_dir);
  let sky_up = sky_radiance(vec3f(0.0, 1.0, 0.0), eye, atmo, sun_dir);
  return mix(sky_n * 0.35, sky_up * 0.55, up);
}

fn sky_specular_radiance(
  refl: vec3f,
  roughness: f32,
  eye: vec3f,
  atmo: AtmosphereParams,
  sun_dir: vec3f,
) -> vec3f {
  let sharp = sky_radiance(refl, eye, atmo, sun_dir);
  let blur_dir = normalize(mix(refl, vec3f(0.0, 1.0, 0.0), clamp(roughness * 0.75, 0.0, 1.0)));
  let blurred = sky_radiance(blur_dir, eye, atmo, sun_dir);
  return mix(sharp, blurred, clamp(roughness * 1.1, 0.0, 1.0));
}

struct IblContribution {
  diffuse: vec3f,
  specular: vec3f,
}

fn evaluate_ibl(
  material: SurfaceMaterial,
  nrm: vec3f,
  view_dir: vec3f,
  sun_lit: f32,
  ambient_rgb: vec3f,
  eye: vec3f,
  atmo: AtmosphereParams,
  sun_dir: vec3f,
) -> IblContribution {
  let n_dot_v = max(dot(nrm, view_dir), 0.0);
  let f0 = material_f0(material);
  let F = fresnel_schlick_roughness(n_dot_v, f0, material.roughness);
  let kD = (vec3f(1.0) - F) * (1.0 - material.metallic);

  let day_irr = sky_diffuse_irradiance(nrm, eye, atmo, sun_dir);
  let night_irr = ambient_rgb * 0.2;
  let irradiance = mix(night_irr, day_irr, pow(sun_lit, 0.65)) + ambient_rgb * 0.35;
  let diffuse_ibl = kD * material.albedo * irradiance;

  let refl = reflect(-view_dir, nrm);
  let night_env = vec3f(0.002, 0.003, 0.01);
  let day_env = sky_specular_radiance(refl, material.roughness, eye, atmo, sun_dir);
  let env_color = mix(night_env, day_env, pow(sun_lit, 0.5));
  let brdf = env_brdf_approx(n_dot_v, material.roughness);
  let specular_ibl = env_color * (f0 * brdf.x + brdf.y);

  return IblContribution(diffuse_ibl, specular_ibl);
}

fn tone_map_reinhard(color: vec3f, exposure: f32) -> vec3f {
  return vec3f(1.0) - exp(-color * max(exposure, 0.01));
}

fn evaluate_pbr(
  material: SurfaceMaterial,
  n: vec3f,
  v: vec3f,
  surface_pos: vec3f,
  lighting: LightingUniforms,
  overrides: MaterialOverrides,
  atmo: AtmosphereParams,
  camera_pos: vec3f,
  sun_shadow: f32,
) -> LightingResult {
  let nrm = normalize(n);
  let view_dir = normalize(v);
  let f0 = material_f0(material);
  let has_direct_lights = lighting.light_count > 0u;
  let sun_dir = primary_sun_dir(lighting);
  let sun_lit = select(0.0, sun_hemisphere(nrm, sun_dir), has_direct_lights);

  var lo = vec3f(0.0);
  var direct_spec_acc = vec3f(0.0);
  var ibl_spec_acc = vec3f(0.0);

  if (has_direct_lights) {
    let ibl = evaluate_ibl(
      material,
      nrm,
      view_dir,
      sun_lit,
      lighting.ambient.xyz,
      camera_pos,
      atmo,
      sun_dir,
    );
    lo += ibl.diffuse + ibl.specular;
    ibl_spec_acc = ibl.specular;
  } else {
    lo += material.albedo * lighting.ambient.xyz * 0.15;
  }

  let n_dot_v = max(dot(nrm, view_dir), 0.0);

  for (var i = 0u; i < lighting.light_count; i++) {
    let light = lighting.lights[i];
    let radiance = light.color.xyz * light.color.w;

    var l = vec3f(0.0);
    var atten = 1.0;
    if (light.position_or_dir.w < 0.5) {
      l = normalize(light.position_or_dir.xyz);
    } else {
      let light_pos = light.position_or_dir.xyz;
      l = normalize(light_pos - surface_pos);
      atten = attenuate_point(light_pos, surface_pos, light.params.x);
    }

    let n_dot_l = max(dot(nrm, l), 0.0);
    if (n_dot_l <= 0.0) {
      continue;
    }

    let shadow = select(1.0, sun_shadow, light.position_or_dir.w < 0.5);

    let h = normalize(view_dir + l);
    let v_dot_h = max(dot(view_dir, h), 0.0);
    let n_dot_h = max(dot(nrm, h), 0.0);

    let F = fresnel_schlick(v_dot_h, f0);
    let kS = F;
    let kD = (vec3f(1.0) - kS) * (1.0 - material.metallic);
    let diffuse = kD * material.albedo * burley_diffuse(material.roughness, n_dot_v, n_dot_l, v_dot_h);
    let spec = brdf_specular_direct(n_dot_v, n_dot_l, n_dot_h, v_dot_h, material.roughness, f0);
    let contrib = (diffuse + spec) * radiance * n_dot_l * atten * shadow;
    lo += contrib;
    direct_spec_acc += spec * radiance * n_dot_l * atten * shadow;
  }

  let mapped = tone_map_reinhard(lo, overrides.exposure);
  let mapped_direct_spec = tone_map_reinhard(direct_spec_acc, overrides.exposure);
  let mapped_ibl = tone_map_reinhard(ibl_spec_acc, overrides.exposure);

  return LightingResult(mapped, mapped_direct_spec, mapped_ibl);
}

fn pbrLighting(
  material: SurfaceMaterial,
  n: vec3f,
  v: vec3f,
  surface_pos: vec3f,
  lighting: LightingUniforms,
  overrides: MaterialOverrides,
  atmo: AtmosphereParams,
  camera_pos: vec3f,
  sun_shadow: f32,
) -> vec3f {
  return evaluate_pbr(material, n, v, surface_pos, lighting, overrides, atmo, camera_pos, sun_shadow).color;
}`
};
var TERRAIN_POLAR_TERM_MODULE = {
	id: "terrain.polarTerm",
	source: `/*---
id: terrain.polarTerm
entry: polarTerm
category: Terrain
group: Domain
---*/
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}

fn polarTerm(world_pos: vec3f, scale: ScaleContext, params: PlanetParams) -> f32 {
  let polar_amp = params.polar_amplitude * params.radius;
  var polar = 0.0;
  if (should_eval_layer(2.0, scale, params.radius)) {
    polar = ((abs(world_pos.y) / params.radius) - params.polar_scale) * polar_amp;
  }
  return polar;
}`
};
var TERRAIN_SELF_SHADOW_MODULE = {
	id: "terrain.selfShadow",
	source: `/*---
id: terrain.selfShadow
entry: selfShadow
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${VORONOI_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}
const SHADOW_STEPS_MIN: u32 = 4u;
const SHADOW_STEPS_MAX: u32 = 64u;

fn sample_shadow_height(unit_dir: vec3f, params: PlanetParams) -> f32 {
  let v_amp = params.voronoi_amplitude * params.radius;
  let d_amp = params.detail_amplitude * params.radius;
  let total_amplitude = v_amp + d_amp;
  let wl = total_amplitude * (params.water_level - 0.5);

  var distortion = 0.0;
  if (params.voronoi_distortion_scale > 0.0) {
    distortion = fbm_4(unit_dir * params.voronoi_distortion_scale);
  }
  let vor = voronoi3(unit_dir * params.voronoi_scale + (distortion - 0.5) * params.voronoi_distortion_amplitude);

  var height = (vor.x - 0.5) * v_amp;
  var th = height - wl;
  var thf: f32;
  if (th > 0.0) {
    thf = total_amplitude - wl;
  } else {
    thf = wl - params.radius;
  }
  th /= thf;
  th = pow(th, params.erosion);
  th *= thf;
  height = wl + th;

  var radius = params.radius + height;
  return radius;
}

fn selfShadow(
  surface_pos: vec3f,
  sun_dir: vec3f,
  params: PlanetParams,
  meters_per_pixel: f32,
  planet_rot: vec4f,
  softness: f32,
  step_count: f32,
) -> f32 {
  let n = normalize(surface_pos);
  let sun_elev = dot(n, sun_dir);
  if (sun_elev <= 0.0) {
    return 0.0;
  }

  let total_amplitude = (params.voronoi_amplitude + params.detail_amplitude) * params.radius;
  if (total_amplitude <= 0.0) {
    return 1.0;
  }

  let bias = max(meters_per_pixel * 1.5, total_amplitude * 0.01);
  let max_dist = total_amplitude / max(sun_elev, 0.08);
  let steps = u32(clamp(step_count, f32(SHADOW_STEPS_MIN), f32(SHADOW_STEPS_MAX)));
  let step = max_dist / f32(steps);

  let k = mix(60.0, 4.0, clamp(softness, 0.0, 1.0));
  var shade = 1.0;
  var t = bias + step;
  for (var i = 0u; i < steps; i++) {
    let p = surface_pos + sun_dir * t;
    let surf_r = sample_shadow_height(rotate_vector_by_quat_inv(planet_rot, normalize(p)), params);
    let clearance = length(p) - surf_r;
    if (clearance < 0.0) {
      return 0.0;
    }
    shade = min(shade, k * clearance / t);
    t += step;
  }
  return clamp(shade, 0.0, 1.0);
}`
};
var TERRAIN_VORONOI_MODULE = {
	id: "terrain.voronoi",
	source: `/*---
id: terrain.voronoi
entry: voronoi
category: Terrain
group: Domain
---*/
${HASH_WGSL}
${FBM_WGSL}
${VORONOI_WGSL}
${PLANET_TYPES_WGSL}
${KERNEL_HELPERS_WGSL}

fn voronoi(unit_dir: vec3f, distortion: f32, scale: ScaleContext, params: PlanetParams) -> vec3f {
  var vor = vec3f(0.5);
  if (should_eval_layer(10.0, scale, params.radius)) {
    vor = voronoi3(unit_dir * params.voronoi_scale + (distortion - 0.5) * params.voronoi_distortion_amplitude);
  }
  return vor;
}`
};
var TERRAIN_WORLD_NORMAL_MODULE = {
	id: "terrain.worldNormal",
	source: `/*---
id: terrain.worldNormal
entry: worldNormal
category: Terrain
group: Domain
---*/
${KERNEL_HELPERS_WGSL}

fn worldNormal(body_normal: vec3f, planet_rot: vec4f) -> vec3f {
  return normalize(rotate_vector_by_quat(planet_rot, body_normal));
}`
};
//#endregion
//#region ../../packages/procedural-wgsl/src/modules/index.ts
function copyModule(mod) {
	if (mod.dependencies) return {
		id: mod.id,
		source: mod.source,
		dependencies: [...mod.dependencies]
	};
	return {
		id: mod.id,
		source: mod.source
	};
}
PROCEDURAL_UV_MODULE.id, copyModule(PROCEDURAL_UV_MODULE), PROCEDURAL_METRIC_POSITION_MODULE.id, copyModule(PROCEDURAL_METRIC_POSITION_MODULE), NOISE_PERLIN3D_MODULE.id, copyModule(NOISE_PERLIN3D_MODULE), NOISE_SIMPLEX_MODULE.id, copyModule(NOISE_SIMPLEX_MODULE), NOISE_WORLEY_MODULE.id, copyModule(NOISE_WORLEY_MODULE), NOISE_FBM_MODULE.id, copyModule(NOISE_FBM_MODULE), NOISE_RIDGED_FBM_MODULE.id, copyModule(NOISE_RIDGED_FBM_MODULE), MATH_REMAP_MODULE.id, copyModule(MATH_REMAP_MODULE), MATH_CLAMP_MODULE.id, copyModule(MATH_CLAMP_MODULE), MATH_SMOOTHSTEP_MODULE.id, copyModule(MATH_SMOOTHSTEP_MODULE), MATH_ADD_MODULE.id, copyModule(MATH_ADD_MODULE), MATH_MULTIPLY_MODULE.id, copyModule(MATH_MULTIPLY_MODULE), MATH_MIX_MODULE.id, copyModule(MATH_MIX_MODULE), MATH_POW_MODULE.id, copyModule(MATH_POW_MODULE), MATH_ABS_MODULE.id, copyModule(MATH_ABS_MODULE), MATH_BIAS_MODULE.id, copyModule(MATH_BIAS_MODULE), MATH_GAIN_MODULE.id, copyModule(MATH_GAIN_MODULE), SURFACE_PLANE_MODULE.id, copyModule(SURFACE_PLANE_MODULE), SURFACE_CUBE_SPHERE_MODULE.id, copyModule(SURFACE_CUBE_SPHERE_MODULE), TERRAIN_DOMAIN_WARP_MODULE.id, copyModule(TERRAIN_DOMAIN_WARP_MODULE), TERRAIN_VORONOI_MODULE.id, copyModule(TERRAIN_VORONOI_MODULE), TERRAIN_DETAIL_FBM_MODULE.id, copyModule(TERRAIN_DETAIL_FBM_MODULE), TERRAIN_HEIGHT_REMAP_MODULE.id, copyModule(TERRAIN_HEIGHT_REMAP_MODULE), TERRAIN_FINE_TEXTURE_NOISE_MODULE.id, copyModule(TERRAIN_FINE_TEXTURE_NOISE_MODULE), TERRAIN_POLAR_TERM_MODULE.id, copyModule(TERRAIN_POLAR_TERM_MODULE), TERRAIN_BIOME_MATERIAL_MODULE.id, copyModule(TERRAIN_BIOME_MATERIAL_MODULE), TERRAIN_NORMAL_ESTIMATOR_MODULE.id, copyModule(TERRAIN_NORMAL_ESTIMATOR_MODULE), TERRAIN_WORLD_NORMAL_MODULE.id, copyModule(TERRAIN_WORLD_NORMAL_MODULE), TERRAIN_SELF_SHADOW_MODULE.id, copyModule(TERRAIN_SELF_SHADOW_MODULE), MATERIAL_PBR_LIGHTING_MODULE.id, copyModule(MATERIAL_PBR_LIGHTING_MODULE), SURFACE_CUBE_FACE_DIR_MODULE.id, copyModule(SURFACE_CUBE_FACE_DIR_MODULE);
//#endregion
//#region ../../packages/compiler/src/primitiveLoader.ts
var MODULE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
var IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
var COORDINATE_SPACES = new Set([
	"none",
	"world_dir",
	"body_dir",
	"world_pos",
	"body_pos",
	"ideal_fragment_body_dir",
	"height_meters",
	"world_radius_meters",
	"scale_ctx"
]);
var TOP_LEVEL_KEYS = new Set([
	"id",
	"entry",
	"category",
	"description",
	"pure",
	"deterministic",
	"color",
	"icon",
	"keywords",
	"sections",
	"inputs",
	"params",
	"outputs"
]);
var PORT_FIELD_KEYS = new Set([
	"description",
	"semantic",
	"space",
	"unit",
	"range"
]);
var PARAM_FIELD_KEYS = new Set([
	"description",
	"unit",
	"widget",
	"min",
	"max",
	"default",
	"section",
	"scaleBehavior"
]);
var UNITS = new Set([
	"none",
	"m",
	"km",
	"kg",
	"s",
	"rad",
	"deg",
	"1/m"
]);
var SCALE_BEHAVIORS = new Set([
	"freq",
	"ratioR",
	"R_ref",
	"pure",
	"flag",
	"length"
]);
function isPlainObject(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function assertPlainTree(value, path = "frontmatter") {
	if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return;
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) assertPlainTree(value[i], `${path}[${i}]`);
		return;
	}
	if (isPlainObject(value)) {
		for (const [key, child] of Object.entries(value)) assertPlainTree(child, `${path}.${key}`);
		return;
	}
	throw new Error(`Invalid frontmatter value at ${path}`);
}
function normalizeWgslType(type) {
	return type.replace(/\s+/g, "");
}
function wgslTypeToDataType(type) {
	switch (normalizeWgslType(type)) {
		case "f32": return "f32";
		case "bool": return "bool";
		case "vec2<f32>": return "vec2f";
		case "vec3<f32>": return "vec3f";
		case "vec4<f32>": return "vec4f";
		default: throw new Error(`Unsupported WGSL port type: ${type.trim()}`);
	}
}
function findBlockCommentEnd(source, start) {
	let depth = 1;
	let i = start;
	while (i < source.length) {
		if (source.startsWith("/*", i)) {
			depth++;
			i += 2;
			continue;
		}
		if (source.startsWith("*/", i)) {
			depth--;
			if (depth === 0) return i;
			i += 2;
			continue;
		}
		i++;
	}
	return -1;
}
function stripComments(source) {
	let out = "";
	let i = 0;
	while (i < source.length) {
		if (source.startsWith("//", i)) {
			const newline = source.indexOf("\n", i);
			if (newline === -1) break;
			out += "\n";
			i = newline + 1;
			continue;
		}
		if (source.startsWith("/*", i)) {
			const end = findBlockCommentEnd(source, i + 2);
			if (end === -1) throw new Error("Unterminated block comment");
			out += " ";
			i = end + 2;
			continue;
		}
		out += source[i];
		i++;
	}
	return out;
}
function skipWs(source, pos) {
	while (pos < source.length && /\s/.test(source[pos])) pos++;
	return pos;
}
function readIdentifier(source, pos) {
	pos = skipWs(source, pos);
	const match = source.slice(pos).match(/^([A-Za-z_][A-Za-z0-9_]*)/);
	if (!match) return null;
	return {
		value: match[1],
		next: pos + match[1].length
	};
}
function splitTopLevelComma(source) {
	const parts = [];
	let depthParen = 0;
	let depthAngle = 0;
	let start = 0;
	for (let i = 0; i < source.length; i++) {
		const ch = source[i];
		if (ch === "(") depthParen++;
		else if (ch === ")") depthParen--;
		else if (ch === "<") depthAngle++;
		else if (ch === ">") depthAngle--;
		else if (ch === "," && depthParen === 0 && depthAngle === 0) {
			parts.push(source.slice(start, i).trim());
			start = i + 1;
		}
	}
	parts.push(source.slice(start).trim());
	return parts.filter((part) => part.length > 0);
}
function readType(source, pos) {
	pos = skipWs(source, pos);
	let depthAngle = 0;
	let start = pos;
	while (pos < source.length) {
		const ch = source[pos];
		if (ch === "<") depthAngle++;
		else if (ch === ">") depthAngle--;
		else if (depthAngle === 0 && (ch === "," || ch === ")" || ch === "{")) break;
		pos++;
	}
	const value = source.slice(start, pos).trim();
	if (!value) throw new Error("Missing parameter or return type");
	return {
		value,
		next: pos
	};
}
function parseFunctionAt(source, start) {
	let pos = start;
	if (!source.startsWith("fn", pos)) throw new Error("Expected function declaration");
	pos += 2;
	const name = readIdentifier(source, pos);
	if (!name) throw new Error("Missing function name");
	pos = skipWs(source, name.next);
	if (source[pos] !== "(") throw new Error("Expected \"(\" after function name");
	pos++;
	const closeParen = findMatchingParen(source, pos);
	const paramSource = source.slice(pos, closeParen);
	const parameters = [];
	for (const part of splitTopLevelComma(paramSource)) {
		const colon = part.indexOf(":");
		if (colon === -1) throw new Error("Missing parameter type");
		const paramName = part.slice(0, colon).trim();
		const paramType = part.slice(colon + 1).trim();
		if (!IDENT_RE.test(paramName) || !paramType) throw new Error("Invalid parameter declaration");
		parameters.push({
			name: paramName,
			type: paramType
		});
	}
	pos = closeParen + 1;
	pos = skipWs(source, pos);
	if (!source.startsWith("->", pos)) throw new Error("Missing function return type");
	pos += 2;
	const returnType = readType(source, pos);
	pos = skipWs(source, returnType.next);
	if (source[pos] !== "{") throw new Error("Expected function body");
	return {
		signature: {
			name: name.value,
			parameters,
			returnType: returnType.value
		},
		next: pos + 1
	};
}
function findMatchingParen(source, start) {
	let depth = 1;
	let i = start;
	while (i < source.length) {
		const ch = source[i];
		if (ch === "(") depth++;
		else if (ch === ")") {
			depth--;
			if (depth === 0) return i;
		}
		i++;
	}
	throw new Error("Unbalanced parentheses in function parameters");
}
function readSignaturesFromSource(source) {
	const cleaned = stripComments(source);
	const signatures = [];
	const seen = /* @__PURE__ */ new Set();
	let pos = 0;
	while (pos < cleaned.length) {
		const fnIndex = cleaned.indexOf("fn", pos);
		if (fnIndex === -1) break;
		const before = fnIndex === 0 ? "" : cleaned[fnIndex - 1];
		const after = cleaned[fnIndex + 2] ?? " ";
		if (before && /[A-Za-z0-9_]/.test(before) || /[A-Za-z0-9_]/.test(after)) {
			pos = fnIndex + 2;
			continue;
		}
		const parsed = parseFunctionAt(cleaned, fnIndex);
		if (seen.has(parsed.signature.name)) throw new Error(`Duplicate function name: ${parsed.signature.name}`);
		seen.add(parsed.signature.name);
		signatures.push(parsed.signature);
		pos = parsed.next;
	}
	return signatures;
}
function readImportsFromSource(source) {
	const imports = [];
	const seen = /* @__PURE__ */ new Set();
	let inBlock = false;
	let i = 0;
	while (i < source.length) {
		if (!inBlock && source.startsWith("//", i)) {
			const lineEnd = source.indexOf("\n", i);
			const useMatch = source.slice(i, lineEnd === -1 ? source.length : lineEnd).match(/^\s*\/\/\s*@use(?:\s+(.+))?$/);
			if (useMatch) {
				const raw = (useMatch[1] ?? "").trim();
				if (!raw) throw new Error("Invalid @use directive");
				if (!MODULE_ID_RE.test(raw)) throw new Error(`Invalid @use module id: ${raw}`);
				if (!seen.has(raw)) {
					seen.add(raw);
					imports.push(raw);
				}
			}
			i = lineEnd === -1 ? source.length : lineEnd + 1;
			continue;
		}
		if (source.startsWith("/*", i)) {
			const end = findBlockCommentEnd(source, i + 2);
			if (end === -1) throw new Error("Unterminated block comment");
			inBlock = true;
			i = end + 2;
			inBlock = false;
			continue;
		}
		i++;
	}
	return imports;
}
var textWgslSignatureReader = {
	readSignatures: readSignaturesFromSource,
	readImports: readImportsFromSource
};
var FRONTMATTER_RE = /^\s*\/\*---\n([\s\S]*?)\n---\*\//;
function parseFrontmatter(source) {
	const match = source.match(FRONTMATTER_RE);
	if (!match) throw new Error("Missing YAML frontmatter block");
	if (source.slice(match[0].length).match(/^\s*\/\*---[\s\S]*?---\*\//)) throw new Error("Multiple YAML frontmatter blocks");
	const decoded = parse(match[1], { maxAliasCount: 0 });
	if (!isPlainObject(decoded)) throw new Error("Frontmatter must be a mapping");
	assertPlainTree(decoded);
	return decoded;
}
function requireString(value, label) {
	if (typeof value !== "string" || value.length === 0) throw new Error(`Invalid ${label}`);
	return value;
}
function parsePortMetadata(raw, label, allowSpace) {
	if (raw === null || raw === void 0) raw = {};
	if (!isPlainObject(raw)) throw new Error(`Invalid ${label}`);
	const metadata = {};
	let space;
	for (const [key, value] of Object.entries(raw)) {
		if (!PORT_FIELD_KEYS.has(key)) throw new Error(`Unknown port field key: ${key}`);
		if (key === "space") {
			if (!allowSpace) throw new Error(`Unexpected field key: ${key}`);
			if (typeof value !== "string" || !COORDINATE_SPACES.has(value)) throw new Error(`Invalid coordinate space: ${String(value)}`);
			space = value;
		} else if (key === "description" || key === "semantic" || key === "unit") {
			if (typeof value !== "string") throw new Error(`Invalid ${label}.${key}`);
			metadata[key] = value;
		} else if (key === "range") {
			if (!Array.isArray(value) || value.length !== 2 || typeof value[0] !== "number" || typeof value[1] !== "number") throw new Error(`Invalid ${label}.range`);
			metadata.range = [value[0], value[1]];
		}
	}
	return {
		metadata,
		space
	};
}
function omitEmptyMetadata(metadata) {
	const entries = Object.entries(metadata).filter(([, value]) => value !== void 0);
	if (entries.length === 0) return;
	return Object.fromEntries(entries);
}
function parsePrimitiveMetadata(doc) {
	const metadata = {};
	if (doc.description !== void 0) {
		if (typeof doc.description !== "string") throw new Error("Invalid description");
		metadata.description = doc.description;
	}
	if (doc.pure !== void 0) {
		if (typeof doc.pure !== "boolean") throw new Error("Invalid pure");
		metadata.pure = doc.pure;
	}
	if (doc.deterministic !== void 0) {
		if (typeof doc.deterministic !== "boolean") throw new Error("Invalid deterministic");
		metadata.deterministic = doc.deterministic;
	}
	if (doc.color !== void 0) {
		if (typeof doc.color !== "string") throw new Error("Invalid color");
		metadata.color = doc.color;
	}
	if (doc.icon !== void 0) {
		if (typeof doc.icon !== "string") throw new Error("Invalid icon");
		metadata.icon = doc.icon;
	}
	if (doc.keywords !== void 0) {
		if (!Array.isArray(doc.keywords) || doc.keywords.some((item) => typeof item !== "string")) throw new Error("Invalid keywords");
		metadata.keywords = [...doc.keywords];
	}
	return omitEmptyMetadata(metadata);
}
function parseSections(raw) {
	if (raw === void 0) return [];
	if (!Array.isArray(raw)) throw new Error("Invalid sections");
	const sections = raw.map((section, index) => {
		if (!isPlainObject(section)) throw new Error(`Invalid sections[${index}]`);
		for (const key of Object.keys(section)) if (![
			"id",
			"label",
			"order",
			"collapsed",
			"parent"
		].includes(key)) throw new Error(`Unknown section key: ${key}`);
		const parsed = { id: requireString(section.id, `sections[${index}].id`) };
		if (section.label !== void 0) parsed.label = requireString(section.label, `sections[${index}].label`);
		if (section.order !== void 0) {
			if (typeof section.order !== "number") throw new Error(`Invalid sections[${index}].order`);
			parsed.order = section.order;
		}
		if (section.collapsed !== void 0) {
			if (typeof section.collapsed !== "boolean") throw new Error(`Invalid sections[${index}].collapsed`);
			parsed.collapsed = section.collapsed;
		}
		if (section.parent !== void 0) parsed.parent = requireString(section.parent, `sections[${index}].parent`);
		return parsed;
	});
	const ids = /* @__PURE__ */ new Set();
	for (const section of sections) {
		if (ids.has(section.id)) throw new Error(`Duplicate section id: ${section.id}`);
		ids.add(section.id);
	}
	for (const section of sections) if (section.parent && (!ids.has(section.parent) || section.parent === section.id)) throw new Error(`Unknown section parent: ${section.parent}`);
	return sections;
}
function parseParamSchema(raw, label, wgslType, sectionIds) {
	if (!isPlainObject(raw)) throw new Error(`Invalid ${label}`);
	for (const key of Object.keys(raw)) if (!PARAM_FIELD_KEYS.has(key)) throw new Error(`Unknown param field key: ${key}`);
	if (!("default" in raw)) throw new Error(`Missing ${label}.default`);
	const options = {};
	if (raw.description !== void 0) {
		if (typeof raw.description !== "string") throw new Error(`Invalid ${label}.description`);
		options.description = raw.description;
	}
	if (raw.unit !== void 0) {
		if (typeof raw.unit !== "string" || !UNITS.has(raw.unit)) throw new Error(`Invalid ${label}.unit`);
		options[X_UNIT] = raw.unit;
	}
	if (raw.widget !== void 0) {
		if (typeof raw.widget !== "string") throw new Error(`Invalid ${label}.widget`);
		options[X_WIDGET] = raw.widget;
	}
	if (raw.section !== void 0) {
		if (typeof raw.section !== "string" || !sectionIds.has(raw.section)) throw new Error(`Unknown section reference: ${String(raw.section)}`);
		options[X_SECTION] = raw.section;
	}
	if (raw.scaleBehavior !== void 0) {
		if (typeof raw.scaleBehavior !== "string" || !SCALE_BEHAVIORS.has(raw.scaleBehavior)) throw new Error(`Invalid ${label}.scaleBehavior`);
		options[X_SCALE_BEHAVIOR] = raw.scaleBehavior;
	}
	const normalized = normalizeWgslType(wgslType);
	if (normalized === "bool") {
		if (typeof raw.default !== "boolean" || raw.min !== void 0 || raw.max !== void 0) throw new Error(`Invalid ${label}.default`);
		options.default = raw.default;
		return Type.Boolean(options);
	}
	if (normalized !== "f32" && normalized !== "i32") throw new Error(`Unsupported WGSL param type: ${wgslType.trim()}`);
	if (typeof raw.default !== "number") throw new Error(`Invalid ${label}.default`);
	if (raw.min !== void 0 && typeof raw.min !== "number") throw new Error(`Invalid ${label}.min`);
	if (raw.max !== void 0 && typeof raw.max !== "number") throw new Error(`Invalid ${label}.max`);
	options.default = raw.default;
	if (raw.min !== void 0) options.minimum = raw.min;
	if (raw.max !== void 0) options.maximum = raw.max;
	if (raw.min !== void 0 || raw.max !== void 0) options[X_EXTENT] = [raw.min ?? null, raw.max ?? null];
	return normalized === "i32" ? Type.Integer(options) : Type.Number(options);
}
function loadWgslPrimitive(input) {
	const reader = input.reader ?? textWgslSignatureReader;
	const doc = parseFrontmatter(input.source);
	for (const key of Object.keys(doc)) if (!TOP_LEVEL_KEYS.has(key)) throw new Error(`Unknown frontmatter key: ${key}`);
	const id = requireString(doc.id, "id");
	const category = requireString(doc.category, "category");
	if (!isPlainObject(doc.outputs)) throw new Error("Invalid outputs");
	const outputNames = Object.keys(doc.outputs);
	if (outputNames.length !== 1) throw new Error("outputs must contain exactly one entry");
	const outputName = outputNames[0];
	const rawOutput = doc.outputs[outputName];
	const outputField = parsePortMetadata(rawOutput, `outputs.${outputName}`, false);
	const signatures = reader.readSignatures(input.source);
	if (signatures.length === 0) throw new Error("No function signatures found");
	let entryName;
	if (doc.entry !== void 0) entryName = requireString(doc.entry, "entry");
	else if (signatures.length === 1) entryName = signatures[0].name;
	else throw new Error("entry is required when multiple functions are present");
	const signature = signatures.find((candidate) => candidate.name === entryName);
	if (!signature) throw new Error(`Unknown entry function: ${entryName}`);
	if (doc.inputs !== void 0 && !isPlainObject(doc.inputs)) throw new Error("Invalid inputs");
	if (doc.params !== void 0 && !isPlainObject(doc.params)) throw new Error("Invalid params");
	const inputDoc = doc.inputs ?? {};
	const paramDoc = doc.params ?? {};
	const signatureNames = new Set(signature.parameters.map((parameter) => parameter.name));
	for (const key of Object.keys(inputDoc)) if (!signatureNames.has(key)) throw new Error(`Unknown input annotation: ${key}`);
	for (const key of Object.keys(paramDoc)) if (!signatureNames.has(key)) throw new Error(`Unknown param annotation: ${key}`);
	const sections = parseSections(doc.sections);
	const sectionIds = new Set(sections.map((section) => section.id));
	const inputs = [];
	const paramProperties = {};
	const arguments_ = [];
	for (const parameter of signature.parameters) {
		const hasInput = Object.hasOwn(inputDoc, parameter.name);
		if (hasInput === Object.hasOwn(paramDoc, parameter.name)) throw new Error(`WGSL argument must be classified exactly once: ${parameter.name}`);
		if (hasInput) {
			const { metadata, space } = parsePortMetadata(inputDoc[parameter.name], `inputs.${parameter.name}`, true);
			inputs.push({
				name: parameter.name,
				dataType: wgslTypeToDataType(parameter.type),
				...space ? { space } : {},
				metadata: {
					...metadata,
					wgslType: parameter.type.trim()
				}
			});
			arguments_.push({
				name: parameter.name,
				source: "input"
			});
		} else {
			paramProperties[parameter.name] = parseParamSchema(paramDoc[parameter.name], `params.${parameter.name}`, parameter.type, sectionIds);
			arguments_.push({
				name: parameter.name,
				source: "param"
			});
		}
	}
	const outputMetadata = omitEmptyMetadata({
		...outputField.metadata,
		wgslType: signature.returnType.trim()
	});
	const outputs = [{
		name: outputName,
		dataType: wgslTypeToDataType(signature.returnType),
		...outputMetadata ? { metadata: outputMetadata } : {}
	}];
	const metadata = parsePrimitiveMetadata(doc);
	return {
		primitive: {
			id,
			category,
			inputs,
			outputs,
			params: Type.Object(paramProperties, sections.length > 0 ? { [X_SECTIONS]: sections } : {}),
			wgsl: {
				moduleId: input.moduleId,
				entry: signature.name,
				arguments: arguments_
			},
			...metadata ? { metadata } : {}
		},
		imports: reader.readImports(input.source)
	};
}
//#endregion
//#region ../../packages/graph-editor/src/GpuPreviewPanel.svelte
function GpuPreviewPanel($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { graph, output, size = 64, refreshEpoch = 0 } = $$props;
		typeof navigator !== "undefined" && navigator.gpu;
		$$renderer.push(`<div class="preview svelte-q3s2cm"><h2 class="title svelte-q3s2cm">GPU preview</h2> `);
		if (output) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<canvas${attr("width", size)}${attr("height", size)} class="heatmap svelte-q3s2cm"></canvas> `);
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]-->`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<p class="empty svelte-q3s2cm">Wire a scalar output to preview.</p>`);
		}
		$$renderer.push(`<!--]--></div>`);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/MeshPreviewPanel.svelte
function MeshPreviewPanel($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { size = 256, refreshEpoch = 0 } = $$props;
		typeof navigator !== "undefined" && navigator.gpu;
		$$renderer.push(`<div class="preview svelte-10j1d0j"><h2 class="title svelte-10j1d0j">Surface mesh</h2> <div class="surface-toggle svelte-10j1d0j" role="tablist" aria-label="Surface mapping"><button type="button" role="tab"${attr("aria-selected", false)}${attr_class("svelte-10j1d0j", void 0, { "active": false })}>Plane</button> <button type="button" role="tab"${attr("aria-selected", true)}${attr_class("svelte-10j1d0j", void 0, { "active": true })}>Cube-sphere</button></div> <canvas${attr("width", size)}${attr("height", size)} class="mesh svelte-10j1d0j"></canvas> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div>`);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/VegetationPreviewPanel.svelte
function VegetationPreviewPanel($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { graph, refreshEpoch = 0 } = $$props;
		let altitudeMeters = 100;
		let densityOutputName = "";
		let placementOutputName = "";
		let mode = "none";
		typeof navigator !== "undefined" && navigator.gpu;
		$$renderer.push(`<div class="preview svelte-yxbteo"><h2 class="title svelte-yxbteo">Vegetation Preview</h2> <div class="controls svelte-yxbteo"><label class="control-row svelte-yxbteo"><span>Density (vec3f):</span> `);
		$$renderer.select({
			value: densityOutputName,
			class: ""
		}, ($$renderer) => {
			$$renderer.option({ value: "" }, ($$renderer) => {
				$$renderer.push(`-- Select Density --`);
			});
			$$renderer.push(`<!--[-->`);
			const each_array = ensure_array_like(graph.outputs || []);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let output = each_array[$$index];
				$$renderer.option({ value: output.name }, ($$renderer) => {
					$$renderer.push(`${escape_html(output.name)}`);
				});
			}
			$$renderer.push(`<!--]-->`);
		}, "svelte-yxbteo");
		$$renderer.push(`</label> <label class="control-row svelte-yxbteo"><span>Placement (f32):</span> `);
		$$renderer.select({
			value: placementOutputName,
			class: ""
		}, ($$renderer) => {
			$$renderer.option({ value: "" }, ($$renderer) => {
				$$renderer.push(`-- Select Placement --`);
			});
			$$renderer.push(`<!--[-->`);
			const each_array_1 = ensure_array_like(graph.outputs || []);
			for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
				let output = each_array_1[$$index_1];
				$$renderer.option({ value: output.name }, ($$renderer) => {
					$$renderer.push(`${escape_html(output.name)}`);
				});
			}
			$$renderer.push(`<!--]-->`);
		}, "svelte-yxbteo");
		$$renderer.push(`</label> <label class="control-row slider-row svelte-yxbteo"><span>Simulated Altitude: ${escape_html(altitudeMeters)}m</span> <input type="range" min="10" max="2500" step="10"${attr("value", altitudeMeters)} class="svelte-yxbteo"/></label></div> <div class="canvas-container svelte-yxbteo"><canvas width="256" height="256" class="viewport svelte-yxbteo"></canvas> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div> <div class="stats svelte-yxbteo"><div class="stat-item svelte-yxbteo"><span class="label svelte-yxbteo">LOD Mode:</span> <span class="value mode-val svelte-yxbteo">${escape_html(mode.toUpperCase())}</span></div> `);
		$$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div></div>`);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/GraphNodeView.svelte
function GraphNodeView($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { data, selected } = $$props;
		const nodeData = derived(() => data);
		$$renderer.push(`<div${attr_class("graph-node svelte-1z0r9ir", void 0, { "selected": selected })}><div class="label svelte-1z0r9ir">${escape_html(nodeData().label)}</div> <div class="ports svelte-1z0r9ir"><div class="inputs"><!--[-->`);
		const each_array = ensure_array_like(nodeData().inputs);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let input = each_array[$$index];
			$$renderer.push(`<div class="port in svelte-1z0r9ir">`);
			Handle($$renderer, {
				type: "target",
				position: Position.Left,
				id: input.id,
				style: "top: auto; position: relative; transform: none;"
			});
			$$renderer.push(`<!----> <span>${escape_html(input.name)}</span> <span class="type svelte-1z0r9ir">${escape_html(input.dataType)}</span></div>`);
		}
		$$renderer.push(`<!--]--></div> <div class="outputs"><!--[-->`);
		const each_array_1 = ensure_array_like(nodeData().outputs);
		for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
			let output = each_array_1[$$index_1];
			$$renderer.push(`<div class="port out svelte-1z0r9ir"><span class="type svelte-1z0r9ir">${escape_html(output.dataType)}</span> <span>${escape_html(output.name)}</span> `);
			Handle($$renderer, {
				type: "source",
				position: Position.Right,
				id: output.id,
				style: "top: auto; position: relative; transform: none;"
			});
			$$renderer.push(`<!----></div>`);
		}
		$$renderer.push(`<!--]--></div></div></div>`);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/CanvasFitViewBridge.svelte
function CanvasFitViewBridge($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { onregister } = $$props;
		const { fitView } = useSvelteFlow();
	});
}
//#endregion
//#region ../../packages/graph-editor/src/irAdapter.ts
var nodeCounter = 0;
var edgeCounter = 0;
function nextNodeId(primitiveId) {
	nodeCounter += 1;
	return `n_${primitiveId.replace(/\./g, "_")}_${nodeCounter}`;
}
function nextEdgeId() {
	edgeCounter += 1;
	return `e_${edgeCounter}`;
}
function findPort$1(node, portId) {
	return [...node.inputs, ...node.outputs].find((port) => port.id === portId);
}
function instantiatePorts$3(specs, direction) {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		...spec.space !== void 0 ? { space: spec.space } : {}
	}));
}
function createNode(primitiveId, position) {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) throw new Error(`Unknown primitive: ${primitiveId}`);
	return {
		id: nextNodeId(primitiveId),
		primitive: primitiveId,
		inputs: instantiatePorts$3(primitive.inputs, "in"),
		outputs: instantiatePorts$3(primitive.outputs, "out"),
		position
	};
}
function validateConnection(doc, from, to) {
	const issues = [];
	const edgeId = "__validate__";
	const fromNode = doc.nodes.find((node) => node.id === from.node);
	const toNode = doc.nodes.find((node) => node.id === to.node);
	if (!fromNode) issues.push({
		kind: "unknown-node",
		edge: edgeId,
		node: from.node
	});
	if (!toNode) issues.push({
		kind: "unknown-node",
		edge: edgeId,
		node: to.node
	});
	if (!fromNode || !toNode) return {
		ok: false,
		issues
	};
	const fromPort = findPort$1(fromNode, from.port);
	const toPort = findPort$1(toNode, to.port);
	if (!fromPort) issues.push({
		kind: "unknown-port",
		edge: edgeId,
		node: from.node,
		port: from.port
	});
	if (!toPort) issues.push({
		kind: "unknown-port",
		edge: edgeId,
		node: to.node,
		port: to.port
	});
	if (!fromPort || !toPort) return {
		ok: false,
		issues
	};
	if (fromPort.direction !== "out") issues.push({
		kind: "bad-direction",
		edge: edgeId,
		end: "from"
	});
	if (toPort.direction !== "in") issues.push({
		kind: "bad-direction",
		edge: edgeId,
		end: "to"
	});
	if (!compatibleDataTypes(fromPort.dataType, toPort.dataType)) issues.push({
		kind: "type-mismatch",
		edge: edgeId,
		from: fromPort.dataType,
		to: toPort.dataType
	});
	const fromSpace = fromPort.space ?? "none";
	const toSpace = toPort.space ?? "none";
	if (fromSpace !== "none" && toSpace !== "none" && fromSpace !== toSpace) issues.push({
		kind: "space-mismatch",
		edge: edgeId,
		from: fromSpace,
		to: toSpace
	});
	return {
		ok: issues.length === 0,
		issues
	};
}
function applyEditIntent(doc, intent) {
	switch (intent.kind) {
		case "add-node": {
			const node = createNode(intent.primitiveId, intent.position);
			return {
				...doc,
				nodes: [...doc.nodes, node]
			};
		}
		case "remove-node": return {
			...doc,
			nodes: doc.nodes.filter((node) => node.id !== intent.nodeId),
			edges: doc.edges.filter((edge) => edge.from.node !== intent.nodeId && edge.to.node !== intent.nodeId)
		};
		case "duplicate-node": {
			const source = doc.nodes.find((node) => node.id === intent.sourceNodeId);
			if (!source) throw new Error(`Unknown node: ${intent.sourceNodeId}`);
			const node = createNode(source.primitive, intent.position);
			return {
				...doc,
				nodes: [...doc.nodes, {
					...node,
					...source.params !== void 0 ? { params: { ...source.params } } : {}
				}]
			};
		}
		case "add-edge": {
			const validation = validateConnection(doc, intent.from, intent.to);
			if (!validation.ok) throw new Error(`Invalid connection: ${validation.issues.map((issue) => issue.kind).join(", ")}`);
			return {
				...doc,
				edges: [...doc.edges, {
					id: nextEdgeId(),
					from: intent.from,
					to: intent.to
				}]
			};
		}
		case "remove-edge": return {
			...doc,
			edges: doc.edges.filter((edge) => edge.id !== intent.edgeId)
		};
		case "move-node": return {
			...doc,
			nodes: doc.nodes.map((node) => node.id === intent.nodeId ? {
				...node,
				position: intent.position
			} : node)
		};
		case "set-params": return {
			...doc,
			nodes: doc.nodes.map((node) => node.id === intent.nodeId ? {
				...node,
				params: { ...intent.params }
			} : node)
		};
		default: return intent;
	}
}
//#endregion
//#region ../../packages/graph-editor/src/GraphCanvas.svelte
function GraphCanvas($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { graph, selectedNodeId = null, selectedEdgeId = null, onchange, onselectnode, onselectedge, onregisterfitview } = $$props;
		const nodeTypes = { graphNode: GraphNodeView };
		let nodes = [];
		let edges = [];
		function onNodeClick({ node }) {
			onselectedge?.(null);
			onselectnode?.(node.id);
		}
		function onEdgeClick({ edge }) {
			onselectnode?.(null);
			onselectedge?.(edge.id);
		}
		function onPaneClick() {
			onselectnode?.(null);
			onselectedge?.(null);
		}
		function onNodeDragStop({ targetNode }) {
			if (!targetNode) return;
			onchange?.(applyEditIntent(graph, {
				kind: "move-node",
				nodeId: targetNode.id,
				position: targetNode.position
			}));
		}
		function onConnect(connection) {
			if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
			const from = {
				node: connection.source,
				port: connection.sourceHandle
			};
			const to = {
				node: connection.target,
				port: connection.targetHandle
			};
			if (!validateConnection(graph, from, to).ok) return;
			onchange?.(applyEditIntent(graph, {
				kind: "add-edge",
				from,
				to
			}));
		}
		function isValidConnection(connection) {
			if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return false;
			return validateConnection(graph, {
				node: connection.source,
				port: connection.sourceHandle
			}, {
				node: connection.target,
				port: connection.targetHandle
			}).ok;
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer) {
			$$renderer.push(`<div class="canvas svelte-7emnl6">`);
			SvelteFlow($$renderer, {
				nodeTypes,
				isValidConnection,
				fitView: true,
				onconnect: onConnect,
				onnodeclick: onNodeClick,
				onedgeclick: onEdgeClick,
				onpaneclick: onPaneClick,
				onnodedragstop: onNodeDragStop,
				get nodes() {
					return nodes;
				},
				set nodes($$value) {
					nodes = $$value;
					$$settled = false;
				},
				get edges() {
					return edges;
				},
				set edges($$value) {
					edges = $$value;
					$$settled = false;
				},
				children: ($$renderer) => {
					Background($$renderer, {});
					$$renderer.push(`<!----> `);
					Controls($$renderer, {});
					$$renderer.push(`<!----> `);
					CanvasFitViewBridge($$renderer, { onregister: onregisterfitview });
					$$renderer.push(`<!---->`);
				},
				$$slots: { default: true }
			});
			$$renderer.push(`<!----></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer.subsume($$inner_renderer);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/ParamForm.svelte
function ParamForm($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { schema, value, onchange } = $$props;
		const fieldList = derived(() => fields(schema));
		const sectionList = derived(() => sectionsOf(schema));
		function set(key, v) {
			const next = {
				...value,
				[key]: v
			};
			if (!check(schema, next)) return;
			onchange?.(next);
		}
		function unitSuffix(unit) {
			return unit && unit !== "none" ? ` (${unit})` : "";
		}
		function fieldRow($$renderer, field) {
			$$renderer.push(`<label class="field svelte-11iaew9"><span class="field-label svelte-11iaew9">${escape_html(field.key)}${escape_html(unitSuffix(field.annotations.unit))}</span> `);
			if (field.kind === "boolean") {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<input type="checkbox"${attr("checked", !!value[field.key], true)}/>`);
			} else if (field.kind === "enum") {
				$$renderer.push("<!--[1-->");
				$$renderer.select({
					class: "field-input",
					value: String(value[field.key] ?? field.annotations.default ?? ""),
					onchange: (event) => set(field.key, (field.options ?? []).find((option) => String(option) === event.currentTarget.value))
				}, ($$renderer) => {
					$$renderer.push(`<!--[-->`);
					const each_array = ensure_array_like(field.options ?? []);
					for (let $$index_4 = 0, $$length = each_array.length; $$index_4 < $$length; $$index_4++) {
						let option = each_array[$$index_4];
						$$renderer.option({ value: String(option) }, ($$renderer) => {
							$$renderer.push(`${escape_html(option)}`);
						});
					}
					$$renderer.push(`<!--]-->`);
				}, "svelte-11iaew9");
			} else if (field.kind === "number" || field.kind === "integer") {
				$$renderer.push("<!--[2-->");
				const scale = field.annotations.scale ?? 1;
				$$renderer.push(`<input class="field-input svelte-11iaew9" type="number"${attr("value", Number(value[field.key] ?? field.annotations.default ?? 0) / scale)}${attr("min", field.annotations.extent?.[0] != null ? field.annotations.extent[0] / scale : void 0)}${attr("max", field.annotations.extent?.[1] != null ? field.annotations.extent[1] / scale : void 0)}${attr("step", field.kind === "integer" ? 1 : "any")}/>`);
			} else {
				$$renderer.push("<!--[-1-->");
				$$renderer.push(`<input class="field-input svelte-11iaew9" type="text"${attr("value", String(value[field.key] ?? field.annotations.default ?? ""))}/>`);
			}
			$$renderer.push(`<!--]--></label>`);
		}
		$$renderer.push(`<div class="param-form svelte-11iaew9">`);
		if (sectionList().length > 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<!--[-->`);
			const each_array_1 = ensure_array_like(sectionList());
			for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
				let section = each_array_1[$$index_1];
				$$renderer.push(`<details class="section svelte-11iaew9"${attr("open", !section.collapsed, true)}><summary class="svelte-11iaew9">${escape_html(section.label ?? section.id)}</summary> <!--[-->`);
				const each_array_2 = ensure_array_like(fieldList().filter((field) => field.annotations.section === section.id));
				for (let $$index = 0, $$length = each_array_2.length; $$index < $$length; $$index++) {
					let field = each_array_2[$$index];
					fieldRow($$renderer, field);
				}
				$$renderer.push(`<!--]--></details>`);
			}
			$$renderer.push(`<!--]--> <!--[-->`);
			const each_array_3 = ensure_array_like(fieldList().filter((field) => !field.annotations.section));
			for (let $$index_2 = 0, $$length = each_array_3.length; $$index_2 < $$length; $$index_2++) {
				let field = each_array_3[$$index_2];
				fieldRow($$renderer, field);
			}
			$$renderer.push(`<!--]-->`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--[-->`);
			const each_array_4 = ensure_array_like(fieldList());
			for (let $$index_3 = 0, $$length = each_array_4.length; $$index_3 < $$length; $$index_3++) {
				let field = each_array_4[$$index_3];
				fieldRow($$renderer, field);
			}
			$$renderer.push(`<!--]-->`);
		}
		$$renderer.push(`<!--]--> `);
		if (fieldList().length === 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="empty svelte-11iaew9">No parameters.</p>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div>`);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/PortBindingList.svelte
function PortBindingList($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { bindings } = $$props;
		function sourceLabel(binding) {
			switch (binding.source.kind) {
				case "edge": return `${binding.source.fromNode}.${binding.source.fromPort}`;
				case "host": return `Host: ${binding.source.inputId}`;
				case "unconnected":
					if (binding.dataType === "image" || binding.dataType === "mesh" || binding.dataType === "audio") return "Bind asset… (M14)";
					return "Unconnected";
			}
		}
		$$renderer.push(`<div class="port-bindings svelte-tgfb6q"><h3 class="heading svelte-tgfb6q">Inputs</h3> `);
		if (bindings.length === 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="empty svelte-tgfb6q">No input ports.</p>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--[-->`);
			const each_array = ensure_array_like(bindings);
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let binding = each_array[$$index];
				$$renderer.push(`<div class="row svelte-tgfb6q"><span class="name svelte-tgfb6q">${escape_html(binding.name)}</span> <span class="type svelte-tgfb6q">${escape_html(binding.dataType)}</span> <span class="source svelte-tgfb6q">${escape_html(sourceLabel(binding))}</span></div>`);
			}
			$$renderer.push(`<!--]-->`);
		}
		$$renderer.push(`<!--]--></div>`);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/portBindings.ts
function derivePortBindings(doc, nodeId) {
	const node = doc.nodes.find((candidate) => candidate.id === nodeId);
	if (!node) return [];
	return node.inputs.map((port) => {
		const edge = doc.edges.find((candidate) => candidate.to.node === nodeId && candidate.to.port === port.id);
		const source = edge ? {
			kind: "edge",
			edgeId: edge.id,
			fromNode: edge.from.node,
			fromPort: edge.from.port
		} : { kind: "unconnected" };
		return {
			portId: port.id,
			name: port.name,
			dataType: port.dataType,
			...port.space !== void 0 ? { space: port.space } : {},
			source
		};
	});
}
//#endregion
//#region ../../packages/graph-editor/src/InspectorPanel.svelte
function InspectorPanel($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { graph, nodeId, onchange } = $$props;
		const node = derived(() => nodeId ? graph.nodes.find((candidate) => candidate.id === nodeId) : void 0);
		const primitive = derived(() => node() ? getPrimitive(node().primitive) : void 0);
		const paramValue = derived(() => {
			if (!node() || !primitive()) return {};
			return {
				...Value.Create(primitive().params),
				...node().params ?? {}
			};
		});
		const bindings = derived(() => nodeId ? derivePortBindings(graph, nodeId) : []);
		$$renderer.push(`<div class="inspector svelte-nrwmzt">`);
		if (!node() || !primitive()) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="empty svelte-nrwmzt">Select a node to inspect parameters and inputs.</p>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<h2 class="title svelte-nrwmzt">${escape_html(primitive().id)}</h2> `);
			PortBindingList($$renderer, { bindings: bindings() });
			$$renderer.push(`<!----> <h3 class="heading svelte-nrwmzt">Parameters</h3> `);
			ParamForm($$renderer, {
				schema: primitive().params,
				value: paramValue(),
				onchange: (next) => {
					if (!nodeId) return;
					onchange?.(applyEditIntent(graph, {
						kind: "set-params",
						nodeId,
						params: next
					}));
				}
			});
			$$renderer.push(`<!---->`);
		}
		$$renderer.push(`<!--]--></div>`);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/NodePalette.svelte
function NodePalette($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { onadd } = $$props;
		const primitives = derived(listPrimitives);
		$$renderer.push(`<div class="palette svelte-1ky2uth"><h2 class="title svelte-1ky2uth">Primitives</h2> <!--[-->`);
		const each_array = ensure_array_like(primitives());
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let primitive = each_array[$$index];
			$$renderer.push(`<button class="item svelte-1ky2uth" type="button"><span class="name svelte-1ky2uth">${escape_html(primitive.id)}</span> <span class="category svelte-1ky2uth">${escape_html(primitive.category)}</span></button>`);
		}
		$$renderer.push(`<!--]--></div>`);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/ValidationPanel.svelte
function ValidationPanel($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { graph, markupError = null } = $$props;
		const result = derived(() => validateGraph(graph));
		$$renderer.push(`<div class="validation svelte-1tu78sd"><h2 class="title svelte-1tu78sd">Validation</h2> `);
		if (markupError) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="error svelte-1tu78sd">Markup: ${escape_html(markupError)}</p>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		if (result().ok) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="ok svelte-1tu78sd">Graph is valid.</p>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<ul class="issues svelte-1tu78sd"><!--[-->`);
			const each_array = ensure_array_like(result().issues);
			for (let index = 0, $$length = each_array.length; index < $$length; index++) {
				let issue = each_array[index];
				$$renderer.push(`<li>${escape_html(issue.kind)} `);
				if (issue.kind === "unknown-port") {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`(${escape_html(issue.edge)}: ${escape_html(issue.node)}.${escape_html(issue.port)})`);
				} else if (issue.kind === "type-mismatch") {
					$$renderer.push("<!--[1-->");
					$$renderer.push(`(${escape_html(issue.edge)}: ${escape_html(issue.from)} → ${escape_html(issue.to)})`);
				} else if ("edge" in issue) {
					$$renderer.push("<!--[2-->");
					$$renderer.push(`(${escape_html(issue.edge)})`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]--></li>`);
			}
			$$renderer.push(`<!--]--></ul>`);
		}
		$$renderer.push(`<!--]--></div>`);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/markup/parseGraphMarkup.ts
var MarkupParseError = class extends Error {
	line;
	column;
	constructor(message, line, column) {
		super(message);
		this.name = "MarkupParseError";
		this.line = line;
		this.column = column;
	}
};
var ALLOWED_ROOT = "PlanetGraph";
var ALLOWED_ROOT_CHILDREN = new Set([
	"Node",
	"Edge",
	"Output",
	"Consumer"
]);
var ALLOWED_NODE_CHILDREN = new Set(["Param"]);
function unescapeAttr(value) {
	return value.replace(/&quot;/g, "\"").replace(/&lt;/g, "<").replace(/&amp;/g, "&");
}
function parseParamValue(raw) {
	if (raw === "true") return true;
	if (raw === "false") return false;
	if (/^-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) return Number(raw);
	return unescapeAttr(raw);
}
function parsePortRef(raw, context) {
	const dot = raw.indexOf(".");
	if (dot <= 0 || dot === raw.length - 1) throw new MarkupParseError(`Invalid port ref "${raw}" on ${context}`);
	return {
		node: raw.slice(0, dot),
		port: raw.slice(dot + 1)
	};
}
function parseAttributes(fragment) {
	const attrs = {};
	const attrRe = /([A-Za-z_][\w.-]*)\s*=\s*"([^"]*)"/g;
	let match;
	while ((match = attrRe.exec(fragment)) !== null) attrs[match[1]] = unescapeAttr(match[2]);
	return attrs;
}
function lineColumnAt(source, index) {
	let line = 1;
	let column = 1;
	for (let i = 0; i < index; i++) if (source[i] === "\n") {
		line++;
		column = 1;
	} else column++;
	return {
		line,
		column
	};
}
function parseElements(source) {
	const elements = [];
	const stack = [];
	let index = 0;
	while (index < source.length) {
		while (index < source.length && /\s/.test(source[index])) index++;
		if (index >= source.length) break;
		if (source[index] !== "<") {
			const { line, column } = lineColumnAt(source, index);
			throw new MarkupParseError("Expected markup element", line, column);
		}
		const { line, column } = lineColumnAt(source, index);
		index++;
		const closing = source[index] === "/";
		if (closing) index++;
		const nameStart = index;
		while (index < source.length && /[\w.-]/.test(source[index])) index++;
		const name = source.slice(nameStart, index);
		if (!name) throw new MarkupParseError("Expected element name", line, column);
		if (closing) {
			while (index < source.length && source[index] !== ">") index++;
			if (source[index] !== ">") throw new MarkupParseError("Expected \">\" closing tag", line, column);
			index++;
			const open = stack.pop();
			if (!open || open.name !== name) throw new MarkupParseError(`Unexpected closing tag </${name}>`, line, column);
			continue;
		}
		const attrsStart = index;
		while (index < source.length && source[index] !== ">" && !(source[index] === "/" && source[index + 1] === ">")) index++;
		const attrs = parseAttributes(source.slice(attrsStart, index));
		const selfClosing = source[index] === "/";
		if (selfClosing) index++;
		if (source[index] !== ">") throw new MarkupParseError("Expected \">\" after element", line, column);
		index++;
		const element = {
			name,
			attrs,
			children: [],
			selfClosing,
			line,
			column
		};
		if (selfClosing) {
			if (stack.length === 0) elements.push(element);
			else stack[stack.length - 1].children.push(element);
			continue;
		}
		if (stack.length === 0) elements.push(element);
		else stack[stack.length - 1].children.push(element);
		stack.push(element);
	}
	if (stack.length > 0) {
		const open = stack[stack.length - 1];
		throw new MarkupParseError(`Unclosed element <${open.name}>`, open.line, open.column);
	}
	return elements;
}
function requireAttr(element, name) {
	const value = element.attrs[name];
	if (value === void 0) throw new MarkupParseError(`<${element.name}> missing required attribute "${name}"`, element.line, element.column);
	return value;
}
function instantiatePorts$2(specs, direction) {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? "none"
	}));
}
function parseNodeElement(element) {
	for (const child of element.children) if (!ALLOWED_NODE_CHILDREN.has(child.name)) throw new MarkupParseError(`Unknown element <${child.name}> inside <Node>`, child.line, child.column);
	const id = requireAttr(element, "id");
	const primitive = requireAttr(element, "primitive");
	const primitiveDef = getPrimitive(primitive);
	if (!primitiveDef) throw new MarkupParseError(`Unknown primitive "${primitive}" on <Node id="${id}">`, element.line, element.column);
	const params = {};
	for (const child of element.children) {
		if (child.name !== "Param") continue;
		const name = requireAttr(child, "name");
		params[name] = parseParamValue(requireAttr(child, "value"));
	}
	const node = {
		id,
		primitive,
		inputs: instantiatePorts$2(primitiveDef.inputs, "in"),
		outputs: instantiatePorts$2(primitiveDef.outputs, "out")
	};
	if (element.attrs.x !== void 0 || element.attrs.y !== void 0) {
		const x = element.attrs.x !== void 0 ? Number(element.attrs.x) : 0;
		const y = element.attrs.y !== void 0 ? Number(element.attrs.y) : 0;
		if (Number.isNaN(x) || Number.isNaN(y)) throw new MarkupParseError(`<Node id="${id}"> has invalid x/y coordinates`, element.line, element.column);
		node.position = {
			x,
			y
		};
	}
	if (Object.keys(params).length > 0) node.params = params;
	return node;
}
function parseRoot(root) {
	if (root.name !== ALLOWED_ROOT) throw new MarkupParseError(`Expected root element <${ALLOWED_ROOT}>`, root.line, root.column);
	const version = requireAttr(root, "version");
	const nodes = [];
	const edges = [];
	const outputs = [];
	const consumers = [];
	for (const child of root.children) {
		if (!ALLOWED_ROOT_CHILDREN.has(child.name)) throw new MarkupParseError(`Unknown element <${child.name}> inside <${ALLOWED_ROOT}>`, child.line, child.column);
		switch (child.name) {
			case "Node":
				nodes.push(parseNodeElement(child));
				break;
			case "Edge":
				edges.push({
					id: requireAttr(child, "id"),
					from: parsePortRef(requireAttr(child, "from"), `<Edge id="${child.attrs.id ?? ""}">`),
					to: parsePortRef(requireAttr(child, "to"), `<Edge id="${child.attrs.id ?? ""}">`)
				});
				break;
			case "Output":
				outputs.push({
					name: requireAttr(child, "name"),
					from: parsePortRef(requireAttr(child, "from"), `<Output name="${child.attrs.name ?? ""}">`)
				});
				break;
			case "Consumer": {
				const outputsAttr = requireAttr(child, "outputs");
				consumers.push({
					type: requireAttr(child, "type"),
					outputs: outputsAttr.split(",").map((part) => part.trim()).filter(Boolean)
				});
				break;
			}
		}
	}
	nodes.sort((a, b) => a.id.localeCompare(b.id));
	edges.sort((a, b) => a.id.localeCompare(b.id));
	return {
		version,
		nodes,
		edges,
		outputs,
		consumers
	};
}
/** Parse bounded PlanetGraph markup into a GraphDocument. */
function parseGraphMarkup(source) {
	const trimmed = source.trim();
	if (!trimmed) throw new MarkupParseError("Empty markup source", 1, 1);
	const elements = parseElements(trimmed);
	if (elements.length !== 1) throw new MarkupParseError("Markup must contain exactly one root element", 1, 1);
	return parseRoot(elements[0]);
}
HighlightStyle.define([
	{
		tag: tags.keyword,
		color: "#7aa2ff"
	},
	{
		tag: tags.string,
		color: "#9ece6a"
	},
	{
		tag: tags.lineComment,
		color: "#565f89"
	},
	{
		tag: tags.blockComment,
		color: "#565f89"
	},
	{
		tag: tags.number,
		color: "#ff9e64"
	},
	{
		tag: tags.typeName,
		color: "#2ac3de"
	},
	{
		tag: tags.tagName,
		color: "#bb9af7"
	},
	{
		tag: tags.attributeName,
		color: "#7dcfff"
	},
	{
		tag: tags.propertyName,
		color: "#7dcfff"
	},
	{
		tag: tags.meta,
		color: "#bb9af7"
	}
]);
EditorView.theme({
	"&": {
		backgroundColor: "#0d1018",
		color: "#dbe4ff"
	},
	".cm-content": { caretColor: "#dbe4ff" },
	"&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": { backgroundColor: "rgba(93, 140, 255, 0.25)" },
	".cm-gutters": { display: "none" },
	".cm-activeLine": { backgroundColor: "transparent" }
});
//#endregion
//#region ../../packages/graph-editor/src/codemirror/wgslTokens.ts
/** Shared WGSL stream tokenizer for primitive-source body regions. */
var KEYWORDS = new Set([
	"fn",
	"var",
	"let",
	"const",
	"struct",
	"return",
	"if",
	"else",
	"for",
	"while",
	"loop",
	"switch",
	"case",
	"break",
	"continue",
	"true",
	"false"
]);
var TYPES = new Set([
	"f32",
	"i32",
	"u32",
	"bool",
	"vec2",
	"vec3",
	"vec4",
	"mat2x2",
	"mat3x3",
	"mat4x4",
	"texture_2d",
	"sampler"
]);
function tokenizeWgslBody(stream, state) {
	if (state.inBlockComment) {
		if (stream.match("*/")) {
			state.inBlockComment = false;
			return "comment";
		}
		stream.next();
		return "comment";
	}
	stream.eatWhile((ch) => ch === " " || ch === "	");
	if (stream.eol()) return null;
	if (stream.match("//")) {
		stream.skipToEnd();
		return "comment";
	}
	if (stream.match("/*")) {
		state.inBlockComment = true;
		return "comment";
	}
	if (stream.sol() && stream.match(/^@\w+/)) return "attribute";
	if (stream.match(/^"([^"\\]|\\.)*"/)) return "string";
	if (stream.match(/^\d+(\.\d+)?([eE][+-]?\d+)?[fu]?/)) return "number";
	if (stream.match(/^[A-Za-z_]\w*/)) {
		const ident = stream.current();
		if (KEYWORDS.has(ident)) return "keyword";
		if (TYPES.has(ident)) return "typeName";
		return null;
	}
	stream.next();
	return null;
}
//#endregion
//#region ../../packages/graph-editor/src/codemirror/primitiveSourceLanguage.ts
var FRONTMATTER_OPEN = "/*---";
var FRONTMATTER_CLOSE = "---*/";
StreamLanguage.define({
	name: "primitive-source",
	startState: () => ({
		mode: "seekOpen",
		inBlockComment: false
	}),
	token(stream, state) {
		if (state.mode === "seekOpen") {
			if (stream.match(FRONTMATTER_OPEN)) {
				state.mode = "frontmatter";
				return "meta";
			}
			state.mode = "body";
		}
		if (state.mode === "frontmatter") {
			if (stream.match(FRONTMATTER_CLOSE)) {
				state.mode = "body";
				return "meta";
			}
			if (stream.sol() && stream.match(/^[\w.-]+:/)) return "propertyName";
			if (stream.match(/^#.*/)) return "comment";
			if (stream.match(/^"([^"\\]|\\.)*"/)) return "string";
			if (stream.match(/^\d+(\.\d+)?/)) return "number";
			stream.next();
			return null;
		}
		return tokenizeWgslBody(stream, state);
	},
	tokenTable: styleTags({
		meta: tags.meta,
		propertyName: tags.propertyName,
		comment: tags.lineComment,
		string: tags.string,
		number: tags.number,
		keyword: tags.keyword,
		typeName: tags.typeName,
		attribute: tags.meta
	})
});
StreamLanguage.define({
	name: "wgsl",
	startState: () => ({ inBlockComment: false }),
	token(stream, state) {
		return tokenizeWgslBody(stream, state);
	},
	tokenTable: styleTags({
		keyword: tags.keyword,
		typeName: tags.typeName,
		comment: tags.blockComment,
		number: tags.number,
		attribute: tags.meta,
		string: tags.string
	})
});
//#endregion
//#region ../../packages/graph-editor/src/CodeMirrorEditor.svelte
function CodeMirrorEditor($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { value = "", language, onchange, readOnly = false, class: className = "" } = $$props;
		let view = null;
		onDestroy(() => {
			view?.destroy();
			view = null;
		});
		$$renderer.push(`<div${attr_class(`cm-host ${stringify(className)}`, "svelte-k0i0w7")}></div>`);
		bind_props($$props, { value });
	});
}
//#endregion
//#region ../../packages/graph-editor/src/MarkupView.svelte
function MarkupView($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { graph, onchange, onerror, registerActions } = $$props;
		let draft = "";
		let parseTimer;
		function scheduleParse() {
			clearTimeout(parseTimer);
			parseTimer = setTimeout(() => {
				try {
					const next = parseGraphMarkup(draft);
					JSON.stringify(next);
					onchange?.(next);
				} catch (error) {
					if (error instanceof MarkupParseError) onerror?.(error);
					else onerror?.(new MarkupParseError(error instanceof Error ? error.message : "Parse failed"));
				}
			}, 300);
		}
		function onDraftChange(next) {
			draft = next;
			scheduleParse();
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer) {
			$$renderer.push(`<div class="markup svelte-195ybz1"><h2 class="title svelte-195ybz1">Markup</h2> `);
			CodeMirrorEditor($$renderer, {
				class: "code",
				language: "planet-markup",
				onchange: onDraftChange,
				get value() {
					return draft;
				},
				set value($$value) {
					draft = $$value;
					$$settled = false;
				}
			});
			$$renderer.push(`<!----></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer.subsume($$inner_renderer);
	});
}
//#endregion
//#region ../../packages/graph-editor/src/userPrimitives.ts
var USER_PRIMITIVES_STORAGE_KEY = "virtual-planet:graph-editor:user-primitives:v1";
var userSources = /* @__PURE__ */ new Map();
var hydrated = false;
function storage$2() {
	if (typeof localStorage === "undefined") return null;
	return localStorage;
}
function isUserPrimitiveId(id) {
	return id.startsWith("user.");
}
function readStoredSources() {
	const store = storage$2();
	if (!store) return {};
	const raw = store.getItem(USER_PRIMITIVES_STORAGE_KEY);
	if (raw === null) return {};
	try {
		const parsed = JSON.parse(raw);
		if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
		const result = {};
		for (const [key, value] of Object.entries(parsed)) if (typeof value === "string" && isUserPrimitiveId(key)) result[key] = value;
		return result;
	} catch {
		return {};
	}
}
function registerUserPrimitiveFromSource(userId, source, evalCPU) {
	if (!isUserPrimitiveId(userId)) throw new Error("User primitive ids must start with user.");
	const loaded = loadWgslPrimitive({
		moduleId: userId,
		source
	});
	if (loaded.primitive.id !== userId) throw new Error(`Primitive id mismatch: expected ${userId}, got ${loaded.primitive.id}`);
	const primitive = {
		...loaded.primitive,
		...evalCPU !== void 0 ? { evalCPU } : {}
	};
	registerPrimitive(primitive);
	userSources.set(userId, source);
	return primitive;
}
function hydrateUserPrimitives() {
	if (hydrated) return;
	hydrated = true;
	userSources.clear();
	for (const [userId, source] of Object.entries(readStoredSources())) try {
		registerUserPrimitiveFromSource(userId, source);
	} catch {}
}
//#endregion
//#region ../../packages/graph-editor/src/primitiveSources.ts
function ensureReady() {
	hydrateUserPrimitives();
}
function isBuiltinPrimitive(id) {
	ensureReady();
	return !isUserPrimitiveId(id) && getPrimitive(id) !== void 0;
}
function isEditablePrimitive(id) {
	ensureReady();
	return isUserPrimitiveId(id) && getPrimitive(id) !== void 0;
}
//#endregion
//#region ../../packages/graph-editor/src/CodeView.svelte
function CodeView($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { graph, moduleId = "noise.perlin3d", onchange, onsave, onerror, registerActions } = $$props;
		const editablePrimitives = derived(() => listPrimitives().filter((primitive) => primitive.wgsl?.moduleId));
		const readOnly = derived(() => moduleId ? isBuiltinPrimitive(moduleId) : false);
		let draft = "";
		let dirty = false;
		let status = null;
		function onDraftChange(next) {
			if (readOnly()) return;
			draft = next;
			dirty = true;
			status = null;
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer) {
			$$renderer.push(`<div class="code-view svelte-19et6m2"><div class="header svelte-19et6m2"><h2 class="title svelte-19et6m2">Primitive</h2> `);
			$$renderer.select({
				class: "picker",
				value: moduleId ?? "",
				onchange: (event) => {
					moduleId = event.currentTarget.value || null;
				}
			}, ($$renderer) => {
				$$renderer.push(`<!--[-->`);
				const each_array = ensure_array_like(editablePrimitives());
				for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
					let primitive = each_array[$$index];
					$$renderer.option({ value: primitive.id }, ($$renderer) => {
						$$renderer.push(`${escape_html(primitive.id)}`);
					});
				}
				$$renderer.push(`<!--]-->`);
			}, "svelte-19et6m2");
			$$renderer.push(` `);
			if (readOnly()) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<span class="badge svelte-19et6m2">built-in · read-only</span> <button class="clone svelte-19et6m2" type="button">Clone</button>`);
			} else if (moduleId && isEditablePrimitive(moduleId)) {
				$$renderer.push("<!--[1-->");
				$$renderer.push(`<span class="badge user svelte-19et6m2">user · editable</span> <button class="save svelte-19et6m2" type="button"${attr("disabled", !dirty, true)}>Save</button>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--> `);
			if (status) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<span class="status svelte-19et6m2">${escape_html(status)}</span>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--></div> <!---->`);
			CodeMirrorEditor($$renderer, {
				class: "editor",
				language: "primitive-source",
				readOnly: readOnly(),
				onchange: onDraftChange,
				get value() {
					return draft;
				},
				set value($$value) {
					draft = $$value;
					$$settled = false;
				}
			});
			$$renderer.push(`<!----></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer.subsume($$inner_renderer);
		bind_props($$props, { moduleId });
	});
}
//#endregion
//#region ../../packages/graph-editor/src/documentStorage.ts
var GRAPH_EDITOR_STORAGE_KEY = "virtual-planet:graph-editor:v1";
function storage$1() {
	if (typeof localStorage === "undefined") throw new Error("localStorage is not available");
	return localStorage;
}
function saveGraphToStorage(doc, key = GRAPH_EDITOR_STORAGE_KEY) {
	storage$1().setItem(key, serializeGraph(doc));
}
//#endregion
//#region ../../packages/graph-editor/src/defaultGraph.ts
function instantiatePorts(specs, direction) {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? "none"
	}));
}
function snapshotNode(id, primitiveId, position, params) {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) throw new Error(`Unknown primitive: ${primitiveId}`);
	return {
		id,
		primitive: primitiveId,
		position,
		inputs: instantiatePorts(primitive.inputs, "in"),
		outputs: instantiatePorts(primitive.outputs, "out"),
		...params !== void 0 ? { params } : {}
	};
}
function portRef(nodeId, primitiveId, direction, index) {
	const primitive = getPrimitive(primitiveId);
	if (!primitive) throw new Error(`Unknown primitive: ${primitiveId}`);
	const port = (direction === "in" ? primitive.inputs : primitive.outputs)[index];
	if (!port) throw new Error(`Missing ${direction} port ${index} on ${primitiveId}`);
	return {
		node: nodeId,
		port: port.name
	};
}
/** Default uv → perlin → remap preview graph using live primitive port names. */
function defaultPreviewGraph() {
	return {
		version: "1",
		nodes: [
			snapshotNode("n_uv", "procedural.uv", {
				x: 0,
				y: 80
			}),
			snapshotNode("n_perlin", "noise.perlin3d", {
				x: 220,
				y: 60
			}),
			snapshotNode("n_remap", "math.remap", {
				x: 460,
				y: 80
			}, {
				inMin: -1,
				inMax: 1,
				outMin: 0,
				outMax: 1
			})
		],
		edges: [{
			id: "e_uv_perlin",
			from: portRef("n_uv", "procedural.uv", "out", 0),
			to: portRef("n_perlin", "noise.perlin3d", "in", 0)
		}, {
			id: "e_perlin_remap",
			from: portRef("n_perlin", "noise.perlin3d", "out", 0),
			to: portRef("n_remap", "math.remap", "in", 0)
		}],
		outputs: [{
			name: "field",
			from: portRef("n_remap", "math.remap", "out", 0)
		}],
		consumers: [{
			type: "preview",
			outputs: ["field"]
		}]
	};
}
function primaryPreviewOutput(doc) {
	return doc.outputs[0]?.from ?? null;
}
//#endregion
//#region ../../packages/subdivide/src/layout/parse.ts
function isRecord$1(value) {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
function coerceNumber(value, field, fallback) {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value);
	throw new Error(`Invalid layout: ${field} must be a finite number`);
}
function coerceBoolean(value, field, fallback) {
	if (typeof value === "boolean") return value;
	if (value === "true") return true;
	if (value === "false") return false;
	if (value === void 0 || value === null) return fallback;
	throw new Error(`Invalid layout: ${field} must be a boolean`);
}
function coerceString(value, field, fallback) {
	if (typeof value === "string" && value.length > 0) return value;
	if (fallback !== void 0) return fallback;
	throw new Error(`Invalid layout: ${field} must be a non-empty string`);
}
function coercePane(raw, defaultZone) {
	if (!isRecord$1(raw) || raw.type !== "pane") throw new Error("Invalid layout: expected pane node");
	return {
		type: "pane",
		id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : createPaneId(),
		zone: coerceString(raw.zone ?? (typeof raw.childProps === "string" ? raw.childProps : void 0), "pane.zone", defaultZone),
		pos: coerceNumber(raw.pos, "pane.pos", 0),
		size: coerceNumber(raw.size, "pane.size", 1)
	};
}
function coerceGroup(raw, defaultZone) {
	if (!isRecord$1(raw) || raw.type !== "group") throw new Error("Invalid layout: expected group node");
	const childrenRaw = raw.children;
	if (!Array.isArray(childrenRaw) || childrenRaw.length === 0) throw new Error("Invalid layout: group must have at least one child");
	const children = childrenRaw.map((child) => {
		if (!isRecord$1(child)) throw new Error("Invalid layout: child must be an object");
		if (child.type === "group") return coerceGroup(child, defaultZone);
		if (child.type === "pane") return coercePane(child, defaultZone);
		throw new Error(`Invalid layout: unknown child type ${String(child.type)}`);
	});
	return {
		type: "group",
		row: coerceBoolean(raw.row, "group.row", false),
		pos: coerceNumber(raw.pos, "group.pos", 0),
		size: coerceNumber(raw.size, "group.size", 1),
		children
	};
}
//#endregion
//#region ../../packages/graph-editor/src/defaultLayout.ts
/** The editor's default pane tree (zones: palette, canvas, preview, code, inspector, validation, markup). */
function defaultGraphEditorLayout() {
	return { root: {
		type: "group",
		row: true,
		pos: 0,
		size: 1,
		children: [
			{
				type: "pane",
				id: createPaneId(),
				zone: "palette",
				pos: 0,
				size: .16
			},
			{
				type: "group",
				row: false,
				pos: .16,
				size: .58,
				children: [
					{
						type: "pane",
						id: createPaneId(),
						zone: "canvas",
						pos: 0,
						size: .62
					},
					{
						type: "pane",
						id: createPaneId(),
						zone: "preview",
						pos: .62,
						size: .2
					},
					{
						type: "pane",
						id: createPaneId(),
						zone: "code",
						pos: .82,
						size: .18
					}
				]
			},
			{
				type: "group",
				row: false,
				pos: .74,
				size: .26,
				children: [
					{
						type: "pane",
						id: createPaneId(),
						zone: "inspector",
						pos: 0,
						size: .52
					},
					{
						type: "pane",
						id: createPaneId(),
						zone: "validation",
						pos: .52,
						size: .24
					},
					{
						type: "pane",
						id: createPaneId(),
						zone: "markup",
						pos: .76,
						size: .24
					}
				]
			}
		]
	} };
}
//#endregion
//#region ../../packages/graph-editor/src/layoutStorage.ts
var GRAPH_EDITOR_LAYOUT_KEY = "virtual-planet:graph-editor-layout:v1";
function storage() {
	if (typeof localStorage === "undefined") throw new Error("localStorage is not available");
	return localStorage;
}
function saveEditorChrome(chrome, key = GRAPH_EDITOR_LAYOUT_KEY) {
	storage().setItem(key, JSON.stringify(chrome));
}
//#endregion
//#region ../../packages/graph-editor/src/clipboard.ts
function pasteOffsetPosition(source) {
	return {
		x: source.x + 24,
		y: source.y + 24
	};
}
//#endregion
//#region ../../packages/graph-editor/src/paneMenus.ts
function createZoneContextMenus(host) {
	return {
		canvas: [
			{
				id: "fit-view",
				label: "Fit view",
				run: () => host.fitCanvasView()
			},
			{
				id: "delete-selection",
				label: "Delete selection",
				disabled: !host.hasSelection(),
				run: () => host.deleteSelection()
			},
			{
				id: "duplicate-node",
				label: "Duplicate node",
				disabled: !host.hasNodeSelection(),
				run: () => host.duplicateSelectedNode()
			}
		],
		preview: [
			{
				id: "preview-cpu",
				label: "CPU preview",
				run: () => host.setPreviewMode("cpu")
			},
			{
				id: "preview-gpu",
				label: "GPU preview",
				run: () => host.setPreviewMode("gpu")
			},
			{
				id: "preview-mesh",
				label: "Mesh preview",
				run: () => host.setPreviewMode("mesh")
			},
			{
				id: "preview-refresh",
				label: "Refresh preview",
				run: () => host.refreshPreview()
			}
		],
		inspector: [{
			id: "clear-selection",
			label: "Clear selection",
			disabled: !host.hasSelection(),
			run: () => host.clearSelection()
		}],
		code: [{
			id: "code-save",
			label: "Save primitive",
			disabled: !host.isCodeDirty(),
			run: () => host.saveCode()
		}, {
			id: "code-revert",
			label: "Revert draft",
			disabled: !host.isCodeDirty(),
			run: () => host.revertCode()
		}],
		markup: [{
			id: "markup-resync",
			label: "Re-sync from graph",
			run: () => host.resyncMarkup()
		}, {
			id: "markup-copy",
			label: "Copy markup",
			run: () => host.copyMarkup()
		}],
		validation: [{
			id: "validation-copy",
			label: "Copy report",
			run: () => host.copyValidationReport()
		}]
	};
}
//#endregion
//#region ../../packages/graph-editor/src/GraphEditor.svelte
function GraphEditor($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { graph = defaultPreviewGraph(), onchange } = $$props;
		let selectedNodeId = null;
		let selectedEdgeId = null;
		let markupParseError = null;
		let codeSaveError = null;
		let selectedPrimitiveModuleId = "noise.perlin3d";
		let previewMode = "cpu";
		let previewRefreshEpoch = 0;
		let canvasFitView = null;
		let codeViewActions = null;
		let markupViewActions = null;
		const zoneContextMenus = derived(() => createZoneContextMenus({
			fitCanvasView: () => canvasFitView?.(),
			hasSelection: () => Boolean(selectedNodeId || selectedEdgeId),
			hasNodeSelection: () => Boolean(selectedNodeId),
			deleteSelection,
			duplicateSelectedNode,
			setPreviewMode,
			refreshPreview: () => {
				previewRefreshEpoch++;
			},
			clearSelection,
			saveCode: () => codeViewActions?.save(),
			isCodeDirty: () => codeViewActions?.isDirty() ?? false,
			revertCode: () => codeViewActions?.revert(),
			resyncMarkup: () => markupViewActions?.resyncFromGraph(),
			copyMarkup: () => {
				markupViewActions?.copyMarkup();
			},
			copyValidationReport: () => {
				const result = validateGraph(graph);
				const lines = [];
				if (markupParseError) lines.push(`Markup: ${markupParseError}`);
				if (codeSaveError) lines.push(`Code: ${codeSaveError}`);
				if (result.ok) lines.push("Graph is valid.");
				else for (const issue of result.issues) lines.push(String(issue.kind));
				navigator.clipboard.writeText(lines.join("\n"));
			}
		}));
		const previewOutput = derived(() => primaryPreviewOutput(graph));
		function debounce(fn, ms) {
			let timer;
			return (...args) => {
				clearTimeout(timer);
				timer = setTimeout(() => fn(...args), ms);
			};
		}
		const debouncedSaveChrome = debounce((chrome) => {
			saveEditorChrome(chrome);
		}, 300);
		function scheduleChromeSave(layoutDoc = layout) {
			debouncedSaveChrome({
				version: 1,
				layout: layoutDoc,
				previewMode
			});
		}
		function onLayoutChange(event) {
			scheduleChromeSave(event.layout);
		}
		function setPreviewMode(mode) {
			previewMode = mode;
			scheduleChromeSave();
		}
		let layout = defaultGraphEditorLayout();
		function updateGraph(next, persist = true) {
			graph = next;
			markupParseError = null;
			codeSaveError = null;
			onchange?.(next);
			if (persist) saveGraphToStorage(next);
		}
		function addPrimitive(primitiveId) {
			const offset = graph.nodes.length * 24;
			updateGraph(applyEditIntent(graph, {
				kind: "add-node",
				primitiveId,
				position: {
					x: 40 + offset,
					y: 40 + offset
				}
			}));
		}
		function clearSelection() {
			selectedNodeId = null;
			selectedEdgeId = null;
		}
		function deleteSelection() {
			if (selectedNodeId) {
				updateGraph(applyEditIntent(graph, {
					kind: "remove-node",
					nodeId: selectedNodeId
				}));
				clearSelection();
				return;
			}
			if (selectedEdgeId) {
				updateGraph(applyEditIntent(graph, {
					kind: "remove-edge",
					edgeId: selectedEdgeId
				}));
				clearSelection();
			}
		}
		function duplicateSelectedNode() {
			if (!selectedNodeId) return;
			const source = graph.nodes.find((node) => node.id === selectedNodeId);
			if (!source) return;
			const position = pasteOffsetPosition(source.position ?? {
				x: 0,
				y: 0
			});
			const next = applyEditIntent(graph, {
				kind: "duplicate-node",
				sourceNodeId: selectedNodeId,
				position
			});
			updateGraph(next);
			selectedNodeId = next.nodes[next.nodes.length - 1]?.id ?? null;
			selectedEdgeId = null;
		}
		function palette($$renderer) {
			NodePalette($$renderer, { onadd: addPrimitive });
		}
		function canvas($$renderer) {
			GraphCanvas($$renderer, {
				graph,
				selectedNodeId,
				selectedEdgeId,
				onchange: updateGraph,
				onregisterfitview: (api) => {
					canvasFitView = () => api.fitView();
				},
				onselectnode: (nodeId) => {
					selectedNodeId = nodeId;
					if (nodeId) selectedEdgeId = null;
				},
				onselectedge: (edgeId) => {
					selectedEdgeId = edgeId;
					if (edgeId) selectedNodeId = null;
				}
			});
		}
		function preview($$renderer) {
			$$renderer.push(`<div class="preview-zone svelte-1re6gyb"><div class="preview-toggle svelte-1re6gyb" role="tablist" aria-label="Preview backend"><button type="button" role="tab"${attr("aria-selected", previewMode === "cpu")}${attr_class("svelte-1re6gyb", void 0, { "active": previewMode === "cpu" })}>CPU</button> <button type="button" role="tab"${attr("aria-selected", previewMode === "gpu")}${attr_class("svelte-1re6gyb", void 0, { "active": previewMode === "gpu" })}>GPU</button> <button type="button" role="tab"${attr("aria-selected", previewMode === "mesh")}${attr_class("svelte-1re6gyb", void 0, { "active": previewMode === "mesh" })}>Mesh</button> <button type="button" role="tab"${attr("aria-selected", previewMode === "vegetation")}${attr_class("svelte-1re6gyb", void 0, { "active": previewMode === "vegetation" })}>Vegetation</button></div> `);
			if (previewMode === "cpu") {
				$$renderer.push("<!--[0-->");
				CpuPreviewPanel($$renderer, {
					graph,
					output: previewOutput(),
					refreshEpoch: previewRefreshEpoch
				});
			} else if (previewMode === "gpu") {
				$$renderer.push("<!--[1-->");
				GpuPreviewPanel($$renderer, {
					graph,
					output: previewOutput(),
					refreshEpoch: previewRefreshEpoch
				});
			} else if (previewMode === "mesh") {
				$$renderer.push("<!--[2-->");
				MeshPreviewPanel($$renderer, { refreshEpoch: previewRefreshEpoch });
			} else {
				$$renderer.push("<!--[-1-->");
				VegetationPreviewPanel($$renderer, {
					graph,
					refreshEpoch: previewRefreshEpoch
				});
			}
			$$renderer.push(`<!--]--></div>`);
		}
		function inspector($$renderer) {
			InspectorPanel($$renderer, {
				graph,
				nodeId: selectedNodeId,
				onchange: updateGraph
			});
		}
		function validation($$renderer) {
			ValidationPanel($$renderer, {
				graph,
				markupError: markupParseError ?? codeSaveError
			});
		}
		function markup($$renderer) {
			MarkupView($$renderer, {
				graph,
				onchange: updateGraph,
				registerActions: (actions) => {
					markupViewActions = actions;
				},
				onerror: (error) => {
					markupParseError = error.message;
				}
			});
		}
		function code($$renderer) {
			CodeView($$renderer, {
				graph,
				registerActions: (actions) => {
					codeViewActions = actions;
				},
				onchange: updateGraph,
				onerror: (message) => {
					codeSaveError = message;
				},
				get moduleId() {
					return selectedPrimitiveModuleId;
				},
				set moduleId($$value) {
					selectedPrimitiveModuleId = $$value;
					$$settled = false;
				}
			});
		}
		let $$settled = true;
		let $$inner_renderer;
		function $$render_inner($$renderer) {
			$$renderer.push(`<div class="graph-editor svelte-1re6gyb"><header class="toolbar svelte-1re6gyb"><button type="button" class="svelte-1re6gyb">New</button> <button type="button" class="svelte-1re6gyb">Save</button> <button type="button" class="svelte-1re6gyb">Load</button> <button type="button" class="svelte-1re6gyb">Download</button> <button type="button" class="svelte-1re6gyb">Upload</button> <button type="button"${attr("disabled", !selectedNodeId && !selectedEdgeId, true)} class="svelte-1re6gyb">Delete</button> `);
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--></header> <input class="file-input svelte-1re6gyb" type="file" accept="application/json,.json"/> <div class="workspace svelte-1re6gyb">`);
			Subdivide($$renderer, {
				onlayoutchange: onLayoutChange,
				zoneContextMenus: zoneContextMenus(),
				zones: {
					palette,
					canvas,
					preview,
					code,
					inspector,
					validation,
					markup
				},
				zoneLabels: {
					palette: "Palette",
					canvas: "Graph",
					preview: "Preview",
					code: "Code",
					inspector: "Inspector",
					validation: "Validation",
					markup: "Markup"
				},
				thickness: "2px",
				padding: "0px",
				color: "#444",
				get layout() {
					return layout;
				},
				set layout($$value) {
					layout = $$value;
					$$settled = false;
				}
			});
			$$renderer.push(`<!----></div></div>`);
		}
		do {
			$$settled = true;
			$$inner_renderer = $$renderer.copy();
			$$render_inner($$inner_renderer);
		} while (!$$settled);
		$$renderer.subsume($$inner_renderer);
		bind_props($$props, { graph });
	});
}
//#endregion
//#region src/routes/+page.svelte
function _page($$renderer) {
	head("1uha8ag", $$renderer, ($$renderer) => {
		$$renderer.title(($$renderer) => {
			$$renderer.push(`<title>Graph Editor</title>`);
		});
	});
	$$renderer.push(`<div class="page svelte-1uha8ag">`);
	GraphEditor($$renderer, {});
	$$renderer.push(`<!----></div>`);
}
//#endregion
export { _page as default };
