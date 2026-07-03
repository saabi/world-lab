export type WebGpuToyLogoVariant = 'isotype' | 'name' | 'both';
export type WebGpuToyLogoTheme = 'light' | 'dark';

export interface SvgViewBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** Tight bounds around the four rounded squares and connector curves. */
export const ISOTYPE_VIEWBOX: SvgViewBox = {
	x: 5.7,
	y: 5,
	width: 368.87,
	height: 246
};

/** Tight bounds around the “WebGPUtoy” wordmark paths. */
export const NAME_VIEWBOX: SvgViewBox = {
	x: 434.26,
	y: 50.05,
	width: 1015.74,
	height: 159.95
};

/** Side-by-side lockup; height follows the isotype. */
export const BOTH_VIEWBOX: SvgViewBox = {
	x: 5.7,
	y: 5,
	width: 1444.3,
	height: 246
};

export const BRAND_COLORS = {
	blue: '#0D3FFD',
	brown: '#814C05',
	purple: '#872EB9',
	green: '#21770C'
} as const;

/** Original artwork — dark letterforms and curves (for light backgrounds). */
const LIGHT_THEME = {
	darkText: '#192638',
	curveStroke: '#373435'
} as const;

/** Dark UI — invert only the darkest text and connector curves; brand colors unchanged. */
const DARK_THEME = {
	darkText: '#e8ecf8',
	curveStroke: '#e8ecf8'
} as const;

export function resolveLogoThemeColors(theme: WebGpuToyLogoTheme) {
	return theme === 'dark' ? DARK_THEME : LIGHT_THEME;
}

export function viewBoxForVariant(variant: WebGpuToyLogoVariant): SvgViewBox {
	switch (variant) {
		case 'isotype':
			return ISOTYPE_VIEWBOX;
		case 'name':
			return NAME_VIEWBOX;
		case 'both':
			return BOTH_VIEWBOX;
	}
}

export const ISOTYPE_RECTS = [
	{ fill: BRAND_COLORS.brown, x: 139.71, y: 5, width: 100.86, height: 100.86, rx: 29.52 },
	{ fill: BRAND_COLORS.blue, x: 139.71, y: 150.14, width: 100.86, height: 100.86, rx: 29.52 },
	{ fill: BRAND_COLORS.purple, x: 273.71, y: 77.57, width: 100.86, height: 100.86, rx: 29.52 },
	{ fill: BRAND_COLORS.green, x: 5.7, y: 77.57, width: 100.86, height: 100.86, rx: 29.52 }
] as const;

export const ISOTYPE_CURVES = [
	'M106.56 128c33.15,0 0,-72.57 33.15,-72.57',
	'M106.56 128c33.15,0 0,72.57 33.15,72.57',
	'M273.71 128c-33.14,0 0,-72.57 -33.14,-72.57',
	'M273.71 128c-33.14,0 0,72.57 -33.14,72.57'
] as const;

/** Blue accent strokes in the wordmark (“GPU”). */
export const NAME_ACCENT_PATHS = [
	'M827.86 88.09l0 48.54c0,8.58 6.09,15.56 13.64,15.68l43.3 -0.02c7.64,0 13.84,-7.02 13.84,-15.68l-0.02 -10.6 -18.02 0 0 -22.38 18.02 0 25.28 0 0 22.38 0 10.6c0,21.01 -17.51,38.05 -39.1,38.05l-43.1 0.01c-21.24,-0.28 -39.11,-16.36 -39.11,-38.04l0 -48.54c0,-21.01 17.51,-38.04 39.11,-38.04l74.15 0 0 22.36 -74.15 0c-7.64,0 -13.84,7.02 -13.84,15.68z',
	'M1014.45 72.41l-46.86 0 0 40.86 46.86 0c7.64,0 13.84,-7.02 13.84,-15.69l0 -9.49c0,-8.66 -6.2,-15.68 -13.84,-15.68zm0 -22.36c21.6,0 39.11,17.03 39.11,38.04l0 9.49c0,21.02 -17.51,38.05 -39.11,38.05l-46.86 0 0 38.87 -25.28 0 0 -124.45 72.14 0z',
	'M1068.02 50.05l25.28 0 0.01 86.42c0,8.66 6.2,15.69 13.84,15.69l34.12 0c7.64,0 13.84,-7.03 13.84,-15.69l-0.06 -86.42 25.28 0 0.04 86.42c0,21.01 -17.51,38.05 -39.1,38.05l-34.12 0c-21.6,0 -39.11,-17.04 -39.11,-38.05l-0.02 -86.42z'
] as const;

/** Dark primary letterforms (“Web”, “toy”, etc.). */
export const NAME_PRIMARY_PATHS = [
	'M713.16 88.58c3.27,-1.21 6.81,-1.87 10.51,-1.87l30.53 0c16.4,0 29.7,12.94 29.7,28.9l0 30.01c0,15.96 -13.3,28.9 -29.7,28.9l-30.53 0 -29.7 0 0 -28.9 0 -30.01 0 -65.57 19.19 0 0 38.54zm10.51 68.96c-5.81,0 -10.51,-5.34 -10.51,-11.92l0 -30.01c0,-6.58 4.7,-11.91 10.51,-11.91l30.53 0 0 -0.01c5.8,0 10.51,5.34 10.51,11.92l0 30.01c0,6.58 -4.71,11.92 -10.51,11.92l-30.53 0z',
	'M676.55 115.61l0 22.5 -19.18 0 -48.81 0 0 7.51c0,6.58 4.71,11.92 10.51,11.92l53.78 0 0 16.98 -53.78 0c-16.4,0 -29.7,-12.94 -29.7,-28.9l0 -30.01c0,-15.96 13.3,-28.9 29.7,-28.9l27.79 0c16.4,0 29.69,12.94 29.69,28.9zm-19.18 0c0,-6.58 -4.71,-11.91 -10.51,-11.91l-27.79 0c-5.8,0 -10.51,5.33 -10.51,11.91l0 7.86 48.81 0 0 -7.86z',
	'M1296.81 110.18l25.24 0c5.27,0 9.55,4.84 9.55,10.82l0 27.27c0,5.97 -4.28,10.82 -9.55,10.82l-25.24 0c-5.27,0 -9.55,-4.85 -9.55,-10.82l0 -27.27c0,-5.98 4.28,-10.82 9.55,-10.82zm0 -15.43l25.24 0c14.9,0 26.98,11.75 26.98,26.25l0 27.27c0,14.49 -12.08,26.25 -26.98,26.25l-25.24 0c-14.9,0 -26.98,-11.76 -26.98,-26.25l0 -27.27c0,-14.5 12.08,-26.25 26.98,-26.25z',
	'M1211.06 148.27c0,14.5 12.08,26.25 26.98,26.25l18.09 0 0 -15.43 -18.09 0c-5.27,0 -9.55,-4.85 -9.55,-10.82l0 -38.09 27.08 0 0 -15.43 -27.08 0 0 -23.8 -17.43 0 0 23.8 -15.21 0 0 15.43 15.21 0 0 38.09z',
	'M1404.76 193.67l0 0c-4.04,9.54 -13.69,16.26 -24.96,16.26l-15.35 0 0 -15.43 15.35 0c5.27,0 7.33,-4 7.99,-5.62l3.01 -7.5 -34.61 -86.51 18.78 0 25.23 63.07 25.31 -63.07 18.79 0c-13.18,32.93 -26.32,65.88 -39.54,98.8z'
] as const;

export const NAME_W_POLYGON =
	'552.92,174.55 582.35,86.79 562.11,86.79 539.96,152.85 517.8,86.79 498.81,86.79 476.65,152.85 454.5,86.79 434.26,86.79 463.69,174.55 487.65,174.55 508.3,112.95 528.96,174.55';

export const LOGO_LABEL = 'WebGPUToy';
