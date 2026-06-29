import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../../primitive.js';
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
	evalFn: (v: readonly [number, number, number]) => readonly [number, number, number]
): NodePrimitive {
	return {
		id,
		category: 'Colour',
		inputs: [{ name: inputName, dataType: 'vec3f' }],
		outputs: [{ name: outputName, dataType: 'vec3f' }],
		params: Type.Object({}),
		wgsl: { moduleId: id, entry },
		metadata: colorMeta,
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
	vec3Primitive('color.srgbTransfer', 'linear', 'encoded', 'srgbTransfer', evalSrgbTransfer)
);
registerPrimitive(
	vec3Primitive(
		'color.srgbTransferInv',
		'encoded',
		'linear',
		'srgbTransferInv',
		evalSrgbTransferInv
	)
);
registerPrimitive(vec3Primitive('color.srgbToXyz', 'srgb', 'xyz', 'srgbToXyz', evalSrgbToXyz));
registerPrimitive(vec3Primitive('color.xyzToSrgb', 'xyz', 'srgb', 'xyzToSrgb', evalXyzToSrgb));
registerPrimitive(vec3Primitive('color.xyzToLab', 'xyz', 'lab', 'xyzToLab', evalXyzToLab));
registerPrimitive(vec3Primitive('color.labToXyz', 'lab', 'xyz', 'labToXyz', evalLabToXyz));
registerPrimitive(vec3Primitive('color.xyzToLuv', 'xyz', 'luv', 'xyzToLuv', evalXyzToLuv));
registerPrimitive(vec3Primitive('color.luvToXyz', 'luv', 'xyz', 'luvToXyz', evalLuvToXyz));
registerPrimitive(
	vec3Primitive('color.lsrgbToOklab', 'lsrgb', 'oklab', 'lsrgbToOklab', evalLsrgbToOklab)
);
registerPrimitive(
	vec3Primitive('color.oklabToLsrgb', 'oklab', 'lsrgb', 'oklabToLsrgb', evalOklabToLsrgb)
);
registerPrimitive(
	vec3Primitive('color.oklabToOklch', 'oklab', 'oklch', 'oklabToOklch', evalOklabToOklch)
);
registerPrimitive(
	vec3Primitive('color.oklchToOklab', 'oklch', 'oklab', 'oklchToOklab', evalOklchToOklab)
);

export { harvestIds };
