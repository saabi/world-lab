import type { Vec3 } from '../math/vec.js';

/** Unit quaternion [x, y, z, w]. */
export type Quat = [number, number, number, number];

export interface Transform {
	position: Vec3;
	rotation: Quat;
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
 * Per-channel transform inheritance as a *degree of separation* up the ancestor
 * chain: 1 = immediate parent (standard); a value ≥ the node's depth clamps to root
 * = the world/inertial frame. Relative (not an ancestor id), so it survives
 * re-parenting. Lets, e.g., a moon's orbit inherit its *position* from its planet
 * (carried along) but its *rotation* from world (so the orbit plane doesn't spin
 * with the planet's day). See _docs/specs/scene-routing.md.
 */
export interface TransformInheritance {
	position: number;
	rotation: number;
	/** Reserved — the runtime Transform has no scale channel yet. */
	scale: number;
}

export interface SceneNodeBase {
	id: string;
	name: string;
	parentId: string | null;
	transform: Transform;
	enabled: boolean;
	/** Optional motion component: drives `transform.position` relative to the parent. */
	orbit?: OrbitElements;
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
