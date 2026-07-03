import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../../primitive.js';
import { registerPrimitive } from '../../registry.js';
import {
	evalLabToXyz,
	evalLsrgbToOklab,
	evalLuvToXyz,
	evalOklabToLsrgb,
	evalOklchToOklab,
	evalOklabToOklch,
	evalSrgbToXyz,
	evalSrgbTransfer,
	evalSrgbTransferInv,
	evalXyzToLab,
	evalXyzToLuv,
	evalXyzToSrgb
} from './evalColorlab.js';

const colorMeta = {
	keywords: ['Effects', 'Colour'] as string[],
	role: 'colorSpace',
	pure: true,
	deterministic: true
};

function vec3Primitive(
	id: string,
	inputName: string,
	outputName: string,
	entry: string,
	evalFn: (v: readonly [number, number, number]) => readonly [number, number, number],
	help: string
): NodePrimitiveInput {
	return {
		id,
		category: 'Colour',
		inputs: [{ name: inputName, dataType: 'vec3f' }],
		outputs: [{ name: outputName, dataType: 'vec3f' }],
		params: Type.Object({}),
		wgsl: { moduleId: id, entry },
		metadata: { ...colorMeta, help },
		evalCPU(ctx) {
			const input = ctx.inputs[inputName] as number[];
			return { [outputName]: [...evalFn(input as [number, number, number])] };
		}
	};
}

const harvestIds = [
	'color.srgbTransfer',
	'color.srgbTransferInv',
	'color.srgbToXyz',
	'color.xyzToSrgb',
	'color.xyzToLab',
	'color.labToXyz',
	'color.xyzToLuv',
	'color.luvToXyz',
	'color.lsrgbToOklab',
	'color.oklabToLsrgb',
	'color.oklabToOklch',
	'color.oklchToOklab'
] as const;

registerPrimitive(
	vec3Primitive(
		'color.srgbTransfer',
		'linear',
		'encoded',
		'srgbTransfer',
		evalSrgbTransfer,
		'Apply sRGB OETF (gamma encode) to linear RGB.'
	)
);
registerPrimitive(
	vec3Primitive(
		'color.srgbTransferInv',
		'encoded',
		'linear',
		'srgbTransferInv',
		evalSrgbTransferInv,
		'Remove sRGB gamma (EOTF) to recover linear RGB.'
	)
);
registerPrimitive(
	vec3Primitive(
		'color.srgbToXyz',
		'srgb',
		'xyz',
		'srgbToXyz',
		evalSrgbToXyz,
		'Convert sRGB (D65) to CIE XYZ.'
	)
);
registerPrimitive(
	vec3Primitive(
		'color.xyzToSrgb',
		'xyz',
		'srgb',
		'xyzToSrgb',
		evalXyzToSrgb,
		'Convert CIE XYZ to sRGB (D65).'
	)
);
registerPrimitive(
	vec3Primitive('color.xyzToLab', 'xyz', 'lab', 'xyzToLab', evalXyzToLab, 'Convert CIE XYZ to CIELAB.')
);
registerPrimitive(
	vec3Primitive('color.labToXyz', 'lab', 'xyz', 'labToXyz', evalLabToXyz, 'Convert CIELAB to CIE XYZ.')
);
registerPrimitive(
	vec3Primitive('color.xyzToLuv', 'xyz', 'luv', 'xyzToLuv', evalXyzToLuv, 'Convert CIE XYZ to CIELUV.')
);
registerPrimitive(
	vec3Primitive('color.luvToXyz', 'luv', 'xyz', 'luvToXyz', evalLuvToXyz, 'Convert CIELUV to CIE XYZ.')
);
registerPrimitive(
	vec3Primitive(
		'color.lsrgbToOklab',
		'lsrgb',
		'oklab',
		'lsrgbToOklab',
		evalLsrgbToOklab,
		'Convert linear sRGB to Oklab.'
	)
);
registerPrimitive(
	vec3Primitive(
		'color.oklabToLsrgb',
		'oklab',
		'lsrgb',
		'oklabToLsrgb',
		evalOklabToLsrgb,
		'Convert Oklab to linear sRGB.'
	)
);
registerPrimitive(
	vec3Primitive(
		'color.oklabToOklch',
		'oklab',
		'oklch',
		'oklabToOklch',
		evalOklabToOklch,
		'Convert Oklab to cylindrical Oklch.'
	)
);
registerPrimitive(
	vec3Primitive(
		'color.oklchToOklab',
		'oklch',
		'oklab',
		'oklchToOklab',
		evalOklchToOklab,
		'Convert Oklch to Oklab.'
	)
);

export { harvestIds };
