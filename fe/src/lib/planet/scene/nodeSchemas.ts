import { Type, quantity, ref, type TSchema } from '@virtual-planet/schema';
import type { SceneNode } from './types.js';

// Schema descriptions of scene-node types, built with @virtual-planet/schema. These
// are the *target* model (forward-looking, authoring-friendly units) for the
// self-describing scene graph: each is introspectable (drives a form), validatable,
// and serializable. They're the bridge from the schema package to the scene model;
// the runtime migration (orbit-as-group, per-channel inheritance, per-body params)
// reconciles the live nodes with these. See _docs/specs/scene-routing.md.

/**
 * Orbit driver params (kinematic). Carried by an orbit *group* node; advanceScene
 * turns these + the clock into the group's transform. Eccentricity is a real,
 * validated [0,1) constraint — the schema catches `eccentricity: 44`.
 */
export const orbitSchema = Type.Object({
	semiMajorAxis: quantity('km', { min: 0, default: 10_000, description: 'Orbit size' }),
	eccentricity: quantity('none', { min: 0, max: 1, default: 0 }),
	periodSeconds: quantity('s', { min: 0, default: 60, description: 'Orbital period' }),
	phaseAtEpoch: quantity('rad', { default: 0, description: 'Mean anomaly at t=0' }),
	periapsisAngle: quantity('rad', { default: 0, description: 'Ellipse orientation' })
});

/**
 * Per-channel transform inheritance: each channel is a scene path (relative or
 * absolute) to the node it inherits from — `'../'` (parent, default), `'/'` (world),
 * `'../sibling'`, `'/sol/ferro'`. Same addressing language as references/routing;
 * cycles are broken at resolution time. See the transform model in scene-routing.md.
 */
export const inheritanceSchema = Type.Object({
	position: ref('../', { description: 'Path to the position-inheritance frame' }),
	rotation: ref('../', { description: 'Path to the rotation-inheritance frame' }),
	scale: ref('../', { description: 'Reserved (no scale channel yet)' })
});

/**
 * A celestial body — describes the *actual* BodyNode fields so a generated form
 * edits them in place. radiusMeters stores SI (metres) and is shown in km (scale).
 * bodyType mirrors BodyType. (mass is a follow-up — needs a display unit.)
 */
export const bodySchema = Type.Object({
	bodyType: Type.Union(
		[
			Type.Literal('star'),
			Type.Literal('planet'),
			Type.Literal('gas_giant'),
			Type.Literal('moon')
		],
		{ default: 'planet' }
	),
	// Stored in metres on the node; displayed in km.
	radiusMeters: quantity('km', { min: 1_000, max: 1e12, default: 500_000, scale: 1000 }),
	standIn: Type.Boolean({ default: false })
});

/** A directional light (schema-driven editor — no bespoke component needed). */
export const directionalLightSchema = Type.Object({
	color: Type.Array(quantity('none', { min: 0, max: 1, default: 1 }), {
		minItems: 3,
		maxItems: 3
	}),
	intensity: quantity('none', { min: 0, default: 1 }),
	// null/'/' = global; a body path scopes it (selective illumination).
	affects: ref('/', { description: 'Body this light illuminates; / = global' })
});

/** A plain transform group (name + transform are on every node; nothing extra). */
export const groupSchema = Type.Object({});

// --- Editor dispatch (two-tier: bespoke override, else schema-driven form) ---

export interface BespokeEditor {
	mode: 'bespoke';
	/** Identifier of a hand-built editor component (resolved by the UI layer). */
	component: string;
}
export interface SchemaEditor {
	mode: 'schema';
	schema: TSchema;
}
export type NodeEditor = BespokeEditor | SchemaEditor;

/** Node kinds that have a rich, hand-built editor (override the generated form).
 *  Bodies now edit in place via the generated form (bodySchema); a bespoke per-body
 *  editor returns here once per-body procedural params exist. */
const BESPOKE: Partial<Record<SceneNode['kind'], string>> = {};

/** Node kinds with a generated-form schema. */
const SCHEMA_BY_KIND: Partial<Record<SceneNode['kind'], TSchema>> = {
	group: groupSchema,
	body: bodySchema,
	directional_light: directionalLightSchema
};

/**
 * Pick the editor for a node kind: a bespoke component when one is registered (the
 * body editor), otherwise a generated form from the kind's schema. This is the
 * generalization of the existing paramEditorSchema-driven editor.
 */
export function editorForKind(kind: SceneNode['kind']): NodeEditor {
	const bespoke = BESPOKE[kind];
	if (bespoke) return { mode: 'bespoke', component: bespoke };
	return { mode: 'schema', schema: SCHEMA_BY_KIND[kind] ?? groupSchema };
}
