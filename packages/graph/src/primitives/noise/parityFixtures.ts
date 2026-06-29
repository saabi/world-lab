/** Independent WGSL/f32 parity vectors for harvested 2D noise (review fixtures). */

export const HASH12_PARITY: { position: readonly [number, number]; value: number }[] = [
	{ position: [0, 0], value: 0 },
	{ position: [1.5, -2.25], value: 0.366_665_124_893_188_5 },
	{ position: [-3.75, 4.125], value: 0.343_403_011_560_440_06 },
	{ position: [12, -0.0625], value: 0.640_284_538_269_043 },
	{ position: [2, 3], value: 0.532_860_457_897_186_3 }
];

export const HASH22_PARITY: {
	position: readonly [number, number];
	value: readonly [number, number];
}[] = [
	{ position: [0, 0], value: [0, 0] },
	{ position: [1.5, -2.25], value: [0.366_665_124_893_188_5, 0.311_485_171_318_054_2] },
	{ position: [-3.75, 4.125], value: [0.343_403_011_560_440_06, 0.560_137_927_532_196] },
	{ position: [12, -0.0625], value: [0.640_284_538_269_043, 0.319_273_591_041_564_94] },
	{ position: [2, 3], value: [0.532_860_457_897_186_3, 0.042_766_176_164_150_24] }
];

export const HASH32_PARITY: {
	position: readonly [number, number];
	value: readonly [number, number, number];
}[] = [
	{ position: [0, 0], value: [0, 0, 0] },
	{
		position: [1.5, -2.25],
		value: [0.556_175_172_328_949, 0.720_922_112_464_904_8, 0.389_931_678_771_972_66]
	},
	{
		position: [-3.75, 4.125],
		value: [0.326_526_671_648_025_5, 0.163_988_515_734_672_55, 0.481_855_660_676_956_2]
	},
	{
		position: [12, -0.0625],
		value: [0.095_634_005_963_802_34, 0.906_663_417_816_162_1, 0.714_087_247_848_510_7]
	},
	{
		position: [2, 3],
		value: [0.065_465_629_100_799_56, 0.902_699_053_287_506_1, 0.150_249_004_364_013_67]
	}
];

export const NOISE2D_CPU_PARITY: {
	id: string;
	position: readonly [number, number];
	params?: Record<string, number>;
	output: Record<string, number | readonly number[]>;
}[] = [
	{
		id: 'noise.value2d',
		position: [0.5, 0.5],
		output: { value: 0.455_902_904_272_079_47 }
	},
	{
		id: 'noise.value2d',
		position: [-1.25, 2.75],
		output: { value: 0.186_114_579_879_358_64 }
	},
	{
		id: 'noise.perlin2d',
		position: [1, 2],
		output: { value: 0.5 }
	},
	{
		id: 'noise.perlin2d',
		position: [-0.5, 3.25],
		output: { value: 0.235_082_080_755_931_9 }
	},
	{
		id: 'noise.perlin2dDeriv',
		position: [1.25, -0.5],
		output: {
			sample: [-0.162_605_734_090_902_84, 0.322_158_524_126_280_1, 0.574_126_687_668_467_6]
		}
	},
	{
		id: 'noise.worley2d',
		position: [2.5, -1],
		output: { value: 0.618_168_993_112_498_8 }
	},
	{
		id: 'noise.voronoi2d',
		position: [2, 3],
		params: { smoothness: 2 },
		output: { value: 0.540_760_822_382_803_9 }
	},
	{
		id: 'noise.blue2d',
		position: [-0.25, 3.5],
		output: { value: 0.673_578_220_978_379_3 }
	}
];
