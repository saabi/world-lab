import { describe, expect, it } from 'vitest';
import {
	DEFAULT_ATMOSPHERE_INTEGRATE_STEPS,
	bodyAtmosphereFromParameters,
	bodyAtmosphereToParameters,
	defaultBodyAtmosphere,
	resolveBodyAtmosphere,
	waterSkyTintRgb
} from './bodyAtmosphere.js';
import { defaultAtmosphereParams } from '../params/atmosphereParams.js';
import type { BodyNode } from './types.js';

function body(extra: Partial<BodyNode> = {}): BodyNode {
	return {
		id: 'b',
		name: 'b',
		parentId: null,
		kind: 'body',
		enabled: true,
		transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
		bodyType: 'planet',
		radiusMeters: 5e5,
		standIn: false,
		...extra
	} as BodyNode;
}

describe('bodyAtmosphere', () => {
	it('default matches the renderer default minus integrateSteps', () => {
		const a = defaultBodyAtmosphere(5e5);
		const p = defaultAtmosphereParams(5e5);
		expect(a).toEqual({
			enabled: p.enabled,
			shellHeightMeters: p.shellHeightMeters,
			scaleHeightMeters: p.scaleHeightMeters,
			rayleighStrength: p.rayleighStrength,
			mieStrength: p.mieStrength,
			mieG: p.mieG,
			groundFogDensity: p.groundFogDensity,
			sunDiskIntensity: p.sunDiskIntensity
		});
		expect(a).not.toHaveProperty('integrateSteps');
	});

	it('resolves the body atmosphere or radius-derived defaults', () => {
		expect(resolveBodyAtmosphere(body())).toEqual(defaultBodyAtmosphere(5e5));
		const custom = { ...defaultBodyAtmosphere(5e5), rayleighStrength: 0.3 };
		expect(resolveBodyAtmosphere(body({ atmosphere: custom }))).toBe(custom);
	});

	it('bridges to/from AtmosphereParameters, owning the step count', () => {
		const a = { ...defaultBodyAtmosphere(100), mieStrength: 0.7 };
		const params = bodyAtmosphereToParameters(a);
		expect(params.integrateSteps).toBe(DEFAULT_ATMOSPHERE_INTEGRATE_STEPS);
		expect(params.mieStrength).toBe(0.7);
		// from() drops the render-quality step count again (round-trips the design)
		expect(bodyAtmosphereFromParameters(bodyAtmosphereToParameters(a, 32))).toEqual(a);
	});

	it('derives a darker sky tint when atmosphere is disabled', () => {
		const disabled = { ...defaultBodyAtmosphere(5e5), enabled: false };
		expect(waterSkyTintRgb(disabled)).toEqual([0.32, 0.46, 0.72]);
	});

	it('brightens sky tint with stronger Rayleigh scattering', () => {
		const weak = { ...defaultBodyAtmosphere(5e5), rayleighStrength: 0.5 };
		const strong = { ...defaultBodyAtmosphere(5e5), rayleighStrength: 2.0 };
		const weakTint = waterSkyTintRgb(weak);
		const strongTint = waterSkyTintRgb(strong);
		expect(strongTint[2]).toBeGreaterThan(weakTint[2]);
	});
});
