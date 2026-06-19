import type { Vec3 } from '../math/vec.js';

/** Unit quaternion [x, y, z, w]. */
export type Quat = [number, number, number, number];

export interface Transform {
	position: Vec3;
	rotation: Quat;
}

export interface SceneNodeBase {
	id: string;
	name: string;
	parentId: string | null;
	transform: Transform;
	enabled: boolean;
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
