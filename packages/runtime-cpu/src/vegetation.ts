import type { Vec3 } from './camera.js';

export type Density3 = readonly [number, number, number];
export type VegetationChannel = 0 | 1 | 2;

/** A metric-space rectangular patch. origin is its minimum x/y corner. */
export interface VegetationPatch {
	id: string;
	origin: Vec3;
	tangentX: Vec3;
	tangentY: Vec3;
	widthMeters: number;
	heightMeters: number;
}

export interface TerrainSample {
	altitudeMeters: number;
	slope: number;
}

export interface VegetationCandidateConfig {
	spacingMeters: number;
	channel: VegetationChannel;
	placementThreshold: number;
	densityThreshold: number;
	minProminence: number;
	minAltitudeMeters?: number;
	maxAltitudeMeters?: number;
	maxSlope?: number;
}

export interface VegetationFieldSamplers {
	density(position: Vec3): Density3;
	placement(position: Vec3): number;
	terrain?: (position: Vec3) => TerrainSample;
}

export interface VegetationCandidate {
	id: string;
	patchId: string;
	position: Vec3;
	localMeters: readonly [number, number];
	density: Density3;
	placement: number;
	prominence: number;
	vigor: number;
}

export interface CoverageConfig {
	channel: VegetationChannel;
	densityStart: number;
	densityFull: number;
}

const TANGENT_EPSILON = 1e-5;

function finite(value: number, label: string): number {
	if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite`);
	return value;
}

function clamp01(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function length(vector: Vec3): number {
	return Math.hypot(vector[0], vector[1], vector[2]);
}

function dot(a: Vec3, b: Vec3): number {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function validateVector(vector: Vec3, label: string): void {
	for (let index = 0; index < 3; index += 1) {
		finite(vector[index], `${label}[${index}]`);
	}
}

function validateChannel(channel: number): asserts channel is VegetationChannel {
	if (!Number.isInteger(channel) || channel < 0 || channel > 2) {
		throw new RangeError('channel must be 0, 1, or 2');
	}
}

function validatePatch(patch: VegetationPatch): void {
	validateVector(patch.origin, 'origin');
	validateVector(patch.tangentX, 'tangentX');
	validateVector(patch.tangentY, 'tangentY');
	if (finite(patch.widthMeters, 'widthMeters') <= 0) {
		throw new RangeError('widthMeters must be positive');
	}
	if (finite(patch.heightMeters, 'heightMeters') <= 0) {
		throw new RangeError('heightMeters must be positive');
	}
	if (Math.abs(length(patch.tangentX) - 1) > TANGENT_EPSILON) {
		throw new RangeError('tangentX must be a unit vector');
	}
	if (Math.abs(length(patch.tangentY) - 1) > TANGENT_EPSILON) {
		throw new RangeError('tangentY must be a unit vector');
	}
	if (Math.abs(dot(patch.tangentX, patch.tangentY)) > TANGENT_EPSILON) {
		throw new RangeError('patch tangents must be orthogonal');
	}
}

function validateConfig(config: VegetationCandidateConfig): void {
	validateChannel(config.channel);
	if (finite(config.spacingMeters, 'spacingMeters') <= 0) {
		throw new RangeError('spacingMeters must be positive');
	}
	for (const [label, value] of [
		['placementThreshold', config.placementThreshold],
		['densityThreshold', config.densityThreshold],
	] as const) {
		finite(value, label);
		if (value < 0 || value > 1) throw new RangeError(`${label} must be in [0,1]`);
	}
	if (finite(config.minProminence, 'minProminence') < 0) {
		throw new RangeError('minProminence must be non-negative');
	}
	if (config.maxSlope !== undefined && finite(config.maxSlope, 'maxSlope') < 0) {
		throw new RangeError('maxSlope must be non-negative');
	}
	if (config.minAltitudeMeters !== undefined) {
		finite(config.minAltitudeMeters, 'minAltitudeMeters');
	}
	if (config.maxAltitudeMeters !== undefined) {
		finite(config.maxAltitudeMeters, 'maxAltitudeMeters');
	}
	if (
		config.minAltitudeMeters !== undefined &&
		config.maxAltitudeMeters !== undefined &&
		config.minAltitudeMeters > config.maxAltitudeMeters
	) {
		throw new RangeError('minAltitudeMeters may not exceed maxAltitudeMeters');
	}
}

function offsetPosition(patch: VegetationPatch, x: number, y: number): Vec3 {
	return [
		patch.origin[0] + patch.tangentX[0] * x + patch.tangentY[0] * y,
		patch.origin[1] + patch.tangentX[1] * x + patch.tangentY[1] * y,
		patch.origin[2] + patch.tangentX[2] * x + patch.tangentY[2] * y,
	];
}

function samplePlacement(
	sampler: VegetationFieldSamplers['placement'],
	position: Vec3,
): number {
	return finite(sampler(position), 'placement sample');
}

function sampleDensity(sampler: VegetationFieldSamplers['density'], position: Vec3): Density3 {
	const density = sampler(position);
	finite(density[0], 'density[0]');
	finite(density[1], 'density[1]');
	finite(density[2], 'density[2]');
	return density;
}

export function generateVegetationCandidates(
	patch: VegetationPatch,
	config: VegetationCandidateConfig,
	samplers: VegetationFieldSamplers,
): VegetationCandidate[] {
	validatePatch(patch);
	validateConfig(config);

	const candidates: VegetationCandidate[] = [];
	const spacing = config.spacingMeters;

	for (let iy = 0; ; iy += 1) {
		const y = (iy + 0.5) * spacing;
		if (y >= patch.heightMeters) break;

		for (let ix = 0; ; ix += 1) {
			const x = (ix + 0.5) * spacing;
			if (x >= patch.widthMeters) break;

			const position = offsetPosition(patch, x, y);
			const placement = samplePlacement(samplers.placement, position);
			const neighbors = [
				samplePlacement(samplers.placement, offsetPosition(patch, x + spacing, y)),
				samplePlacement(samplers.placement, offsetPosition(patch, x - spacing, y)),
				samplePlacement(samplers.placement, offsetPosition(patch, x, y + spacing)),
				samplePlacement(samplers.placement, offsetPosition(patch, x, y - spacing)),
			];
			if (!neighbors.every((neighbor) => placement > neighbor)) continue;

			const prominence = placement - Math.max(...neighbors);
			if (prominence < config.minProminence || placement < config.placementThreshold) {
				continue;
			}

			const density = sampleDensity(samplers.density, position);
			const selectedDensity = density[config.channel];
			if (selectedDensity < config.densityThreshold) continue;

			if (samplers.terrain) {
				const terrain = samplers.terrain(position);
				const altitude = finite(terrain.altitudeMeters, 'altitudeMeters');
				const slope = finite(terrain.slope, 'slope');
				if (
					(config.minAltitudeMeters !== undefined &&
						altitude < config.minAltitudeMeters) ||
					(config.maxAltitudeMeters !== undefined &&
						altitude > config.maxAltitudeMeters) ||
					(config.maxSlope !== undefined && slope > config.maxSlope)
				) {
					continue;
				}
			}

			const placementVigor = clamp01(
				(placement - config.placementThreshold) /
					Math.max(1e-9, 1 - config.placementThreshold),
			);
			candidates.push({
				id: `${patch.id}:${ix}:${iy}:${config.channel}`,
				patchId: patch.id,
				position,
				localMeters: [x, y],
				density,
				placement,
				prominence,
				vigor: clamp01(placementVigor * selectedDensity),
			});
		}
	}

	return candidates;
}

export function evaluateVegetationCoverage(
	density: Density3,
	microVariation: number,
	config: CoverageConfig,
): number {
	validateChannel(config.channel);
	finite(density[0], 'density[0]');
	finite(density[1], 'density[1]');
	finite(density[2], 'density[2]');
	finite(microVariation, 'microVariation');
	finite(config.densityStart, 'densityStart');
	finite(config.densityFull, 'densityFull');
	if (
		config.densityStart < 0 ||
		config.densityFull > 1 ||
		config.densityStart >= config.densityFull
	) {
		throw new RangeError('coverage density range must satisfy 0 <= start < full <= 1');
	}

	const t = clamp01(
		(density[config.channel] - config.densityStart) /
			(config.densityFull - config.densityStart),
	);
	const smooth = t * t * (3 - 2 * t);
	return smooth * clamp01(microVariation);
}
