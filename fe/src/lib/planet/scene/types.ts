import type { Vec3 } from '../math/vec.js';

/** Unit quaternion [x, y, z, w]. */
export type Quat = [number, number, number, number];

export interface Transform {
	position: Vec3;
	rotation: Quat;
	/** Per-axis scale; defaults to [1, 1, 1] when absent. */
	scale?: Vec3;
}

/**
 * Kinematic orbit — a motion component that drives a node's local position from
 * time. Coplanar in the parent's XZ plane (top-down looks down +Y); the ellipse is
 * oriented by `periapsisAngle`. Not a physical simulation, just parametric
 * animation. See _docs/specs/solar-system-scene.md.
 */
export interface OrbitElements {
	/** Semi-major axis (orbit radius for a circle), meters. */
	semiMajorAxis: number;
	/** 0 = circle. */
	eccentricity: number;
	/** Orbital period, seconds. Sign sets direction. */
	periodSeconds: number;
	/** Mean anomaly at t=0, radians. */
	phaseAtEpoch: number;
	/** Ellipse orientation in the XZ plane, radians. */
	periapsisAngle: number;
}

/**
 * Per-channel transform inheritance, each a **scene path** (relative or absolute) to
 * the node that channel inherits from — the same addressing language as references
 * and routing. `'../'` (default) = immediate parent; `'/'` = root/world; `'../../'`,
 * `'../sibling'`, `'/sol/ferro'`, etc. are all valid. Lets, e.g., a moon's orbit
 * inherit its *position* from its planet (carried along) but its *rotation* from
 * world (so the orbit plane doesn't spin with the planet's day). Paths are
 * unrestricted in direction; cycles are broken at resolution time (a cyclic edge
 * resolves to the world frame). See _docs/specs/scene-routing.md.
 */
export interface TransformInheritance {
	position: string;
	rotation: string;
	/** Reserved — the runtime Transform has no scale channel yet. */
	scale: string;
}

/**
 * Orbit phase driver — drives a group node's `transform.rotation` about +Y. With a
 * child "radius" node offset by [R,0,0], the rotation sweeps the offset around a
 * circle: that is the orbit (phase node = center of rotation, radius node = the
 * distance). The orbiting body sits below the radius node and only spins, so spin
 * and orbit stay independent. Circular for now; eccentricity = a future driver on
 * the radius node + the central body offset to a focus. See
 * _docs/specs/solar-system-scene.md.
 */
export interface OrbitPhase {
	periodSeconds: number;
	/** Phase angle at t=0, radians. */
	phaseAtEpoch: number;
}

/**
 * A driver computes named output values from time (and, later, referenced inputs).
 * A node carrying one exposes its outputs to be wired into other nodes' fields via
 * {@link FieldBinding}. The kepler driver outputs `phase` + `radius` for an orbit.
 * See _docs/specs/scene-routing.md (driver/binding dataflow).
 */
export interface KeplerDriver {
	type: 'kepler';
	semiMajorAxis: number;
	eccentricity: number;
	periodSeconds: number;
	phaseAtEpoch: number;
	periapsisAngle: number;
}
export type DriverSpec = KeplerDriver;

export type TransformField =
	| 'positionX'
	| 'positionY'
	| 'positionZ'
	| 'rotationX'
	| 'rotationY'
	| 'rotationZ'
	| 'scaleX'
	| 'scaleY'
	| 'scaleZ';

/** A term's value source: a driver output elsewhere (at `ref` path), or a constant. */
export type TermSource = { ref: string; output: string } | { const: number };

export type TermOp = 'set' | 'add' | 'mul';

/**
 * One term of a field's value. A field is the stored literal plus its terms, folded
 * left-to-right per channel: `set` replaces the accumulator, `add`/`mul` combine. So
 * `[set ../#radius, mul 2, add /bary#x]` ⇒ `radius·2 + bary.x`. A lone `set` with a
 * ref source is a plain binding. See _docs/specs/driven-fields-editor.md.
 */
export interface FieldTerm {
	field: TransformField;
	/** Default 'set'. */
	op?: TermOp;
	source: TermSource;
}

/** Per-axis rotation limit (radians), with an enable toggle. */
export interface AxisLimit {
	enabled: boolean;
	min: number;
	max: number;
}

/** Clamp a node's local rotation per axis (Blender "Limit Rotation"). */
export interface LimitRotationConstraint {
	type: 'limit_rotation';
	x?: AxisLimit;
	y?: AxisLimit;
	z?: AxisLimit;
}

export type Constraint = LimitRotationConstraint;

export interface SceneNodeBase {
	id: string;
	name: string;
	parentId: string | null;
	transform: Transform;
	enabled: boolean;
	/** Optional driver: exposes named outputs (referenced by FieldBindings elsewhere). */
	driver?: DriverSpec;
	/** Optional field terms: compose this node's transform channels from driver outputs / constants. */
	bindings?: FieldTerm[];
	/** Optional constraint stack: transform modifiers applied after the base transform. */
	constraints?: Constraint[];
	/** Optional kinematic position driver (position-model orbit). */
	orbit?: OrbitElements;
	/** Optional orbit-phase driver: rotates this node about +Y (a center of rotation). */
	orbitPhase?: OrbitPhase;
	/** Optional axial spin period (s) about +Y: drives `transform.rotation`. */
	spinPeriodSeconds?: number;
	/** Optional per-channel transform inheritance; absent = all channels inherit from the parent. */
	inheritance?: TransformInheritance;
}

export interface GroupNode extends SceneNodeBase {
	kind: 'group';
}

export type BodyType = 'star' | 'planet' | 'gas_giant' | 'moon';

/**
 * A celestial body. Orbit ownership is the hierarchy: a moon is a child of its
 * planet, a planet a child of its star. "Owns its orbit" = nearest ancestor body.
 */
export interface BodyNode extends SceneNodeBase {
	kind: 'body';
	bodyType: BodyType;
	/** Body radius in meters. */
	radiusMeters: number;
	/**
	 * The planet designer has no real facilities for this body yet (stars, gas
	 * giants) — a placeholder until it does. Real rocky planets are not stand-ins.
	 */
	standIn: boolean;
}

export interface DirectionalLightNode extends SceneNodeBase {
	kind: 'directional_light';
	color: Vec3;
	intensity: number;
	/**
	 * Which bodies this light illuminates. null/undefined = global (all bodies,
	 * e.g. starlight). A bodyId scopes it to that body only — e.g. a moon's
	 * reflected light illuminates only the planet that owns the moon's orbit.
	 */
	affects?: string | null;
}

export interface PointLightNode extends SceneNodeBase {
	kind: 'point_light';
	color: Vec3;
	intensity: number;
	range: number;
	/** See {@link DirectionalLightNode.affects}. null/undefined = global. */
	affects?: string | null;
}

export interface AmbientLightNode extends SceneNodeBase {
	kind: 'ambient_light';
	color: Vec3;
	intensity: number;
}

export type SceneNode =
	| GroupNode
	| BodyNode
	| DirectionalLightNode
	| PointLightNode
	| AmbientLightNode;

export interface PlanetScene {
	rootId: string;
	nodes: Map<string, SceneNode>;
}

/** World-space light ready for GPU packing. */
export interface SceneLight {
	kind: 'directional' | 'point';
	/** Unit vector toward the light (directional) or world position (point). */
	directionOrPosition: Vec3;
	color: Vec3;
	intensity: number;
	range: number;
}

export interface CollectedLighting {
	ambient: Vec3;
	lights: SceneLight[];
}
