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
}

export interface GroupNode extends SceneNodeBase {
	kind: 'group';
}

export interface DirectionalLightNode extends SceneNodeBase {
	kind: 'directional_light';
	color: Vec3;
	intensity: number;
}

export interface PointLightNode extends SceneNodeBase {
	kind: 'point_light';
	color: Vec3;
	intensity: number;
	range: number;
}

export type SceneNode = GroupNode | DirectionalLightNode | PointLightNode;

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
