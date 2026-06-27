import { quantity, Type } from '@virtual-planet/schema';

/** Shared planet shaping params (mirrors PlanetParams uniform fields). */
export const planetRadiusParam = quantity('m', { default: 100 });
export const freqParam = (defaultValue: number) => quantity('1/m', { default: defaultValue });
export const ratioRParam = (defaultValue: number) => quantity('none', { default: defaultValue });
export const pureParam = (defaultValue: number) => quantity('none', { default: defaultValue });

export const scaleMppInput = { name: 'meters_per_pixel', dataType: 'f32' as const, space: 'scale_ctx' as const };
