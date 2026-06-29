/** Independent CPU parity vectors for colorlab harvest (review fixtures). */

export const COLORLAB_CPU_PARITY: {
	id: string;
	inputKey: string;
	input: readonly [number, number, number];
	outputKey: string;
	output: readonly [number, number, number];
}[] = [
	{
		id: 'color.srgbToXyz',
		inputKey: 'srgb',
		input: [1, 1, 1],
		outputKey: 'xyz',
		output: [0.950_449_218_3, 1, 1.088_916_648_5]
	},
	{
		id: 'color.srgbToXyz',
		inputKey: 'srgb',
		input: [0.5, 0.5, 0.5],
		outputKey: 'xyz',
		output: [0.203_435_234_655_378_4, 0.214_041_140_482_232_55, 0.233_072_961_335_030_36]
	},
	{
		id: 'color.srgbToXyz',
		inputKey: 'srgb',
		input: [1, 0, 0],
		outputKey: 'xyz',
		output: [0.412_410_846_5, 0.212_649_342_7, 0.019_331_758_4]
	},
	{
		id: 'color.xyzToSrgb',
		inputKey: 'xyz',
		input: [0.950_449_218_3, 1, 1.088_916_648_5],
		outputKey: 'srgb',
		output: [1.000_000_000_038_646_6, 1.000_000_000_011_235, 1.000_000_000_038_712]
	},
	{
		id: 'color.xyzToSrgb',
		inputKey: 'xyz',
		input: [0.203_435_234_655_378_4, 0.214_041_140_482_232_55, 0.233_072_961_335_030_36],
		outputKey: 'srgb',
		output: [0.500_000_000_020_330_7, 0.500_000_000_005_910_5, 0.500_000_000_020_365_2]
	},
	{
		id: 'color.xyzToLab',
		inputKey: 'xyz',
		input: [0.950_449_218_3, 1, 1.088_916_648_5],
		outputKey: 'lab',
		output: [100, 0, -6.122_302_664_834_933e-9]
	},
	{
		id: 'color.xyzToLab',
		inputKey: 'xyz',
		input: [0.203_435_234_655_378_4, 0.214_041_140_482_232_55, 0.233_072_961_335_030_36],
		outputKey: 'lab',
		output: [53.388_964_741_114_32, 0, -3.662_226_077_949_526_4e-9]
	},
	{
		id: 'color.xyzToLab',
		inputKey: 'xyz',
		input: [0.412_410_846_5, 0.212_649_342_7, 0.019_331_758_4],
		outputKey: 'lab',
		output: [53.238_237_497_765_37, 80.092_301_922_291_88, 67.202_099_092_124_67]
	},
	{
		id: 'color.labToXyz',
		inputKey: 'lab',
		input: [53.238_237_497_765_37, 80.092_301_922_291_88, 67.202_099_092_124_67],
		outputKey: 'xyz',
		output: [0.412_410_846_5, 0.212_649_342_699_999_97, 0.019_331_758_4]
	},
	{
		id: 'color.xyzToLuv',
		inputKey: 'xyz',
		input: [0.950_449_218_3, 1, 1.088_916_648_5],
		outputKey: 'luv',
		output: [100, -4.014_907_850_624_638e-9, -9.504_569_353_779_857e-9]
	},
	{
		id: 'color.xyzToLuv',
		inputKey: 'xyz',
		input: [0.412_410_846_5, 0.212_649_342_7, 0.019_331_758_4],
		outputKey: 'luv',
		output: [53.238_237_497_765_37, 175.011_413_003_527_25, 37.758_636_705_492_705]
	},
	{
		id: 'color.luvToXyz',
		inputKey: 'luv',
		input: [53.238_237_497_765_37, 175.011_413_003_527_25, 37.758_636_705_492_705],
		outputKey: 'xyz',
		output: [0.412_410_846_499_999_93, 0.212_649_342_699_999_97, 0.019_331_758_400_000_065]
	},
	{
		id: 'color.lsrgbToOklab',
		inputKey: 'lsrgb',
		input: [1, 0, 0],
		outputKey: 'oklab',
		output: [0.627_955_360_614_551_6, 0.224_863_061_065_973_98, 0.125_846_298_530_735_1]
	},
	{
		id: 'color.lsrgbToOklab',
		inputKey: 'lsrgb',
		input: [0.184_26, 0.184_26, 0.184_26],
		outputKey: 'oklab',
		output: [0.569_041_166_683_027_8, 4.606_542_924_889_822_6e-11, 2.121_038_800_151_353_6e-8]
	},
	{
		id: 'color.lsrgbToOklab',
		inputKey: 'lsrgb',
		input: [0.5, -0.3, 0.2],
		outputKey: 'oklab',
		output: [-0.258_824_937_483_353_7, 1.985_314_852_550_291_5, -0.679_255_040_925_498_9]
	},
	{
		id: 'color.oklabToLsrgb',
		inputKey: 'oklab',
		input: [0.627_955_360_614_551_6, 0.224_863_061_065_973_98, 0.125_846_298_530_735_1],
		outputKey: 'lsrgb',
		output: [1.000_000_000_218_25, -4.849_502_396_875_316e-11, 7.577_632_965_549_697e-12]
	},
	{
		id: 'color.oklabToLsrgb',
		inputKey: 'oklab',
		input: [-0.258_824_937_483_353_7, 1.985_314_852_550_291_5, -0.679_255_040_925_498_9],
		outputKey: 'lsrgb',
		output: [0.499_999_999_907_439_26, -0.299_999_999_923_871_55, 0.199_999_999_986_553_24]
	},
	{
		id: 'color.oklabToOklch',
		inputKey: 'oklab',
		input: [0.627_955_360_614_551_6, 0.224_863_061_065_973_98, 0.125_846_298_530_735_1],
		outputKey: 'oklch',
		output: [0.627_955_360_614_551_6, 0.257_683_307_736_156_7, 29.233_885_192_342_655]
	},
	{
		id: 'color.oklchToOklab',
		inputKey: 'oklch',
		input: [0.627_955_360_614_551_6, 0.257_683_307_736_156_7, 29.233_885_192_342_655],
		outputKey: 'oklab',
		output: [0.627_955_360_614_551_6, 0.224_863_061_065_973_95, 0.125_846_298_530_735_15]
	},
	{
		id: 'color.srgbTransfer',
		inputKey: 'linear',
		input: [0.003_130_8, 0.001, 0.000_5],
		outputKey: 'encoded',
		output: [0.040_449_936, 0.012_920_000_000_000_001, 0.006_460_000_000_000_000_5]
	},
	{
		id: 'color.srgbTransfer',
		inputKey: 'linear',
		input: [0.5, 0.18, 0.9],
		outputKey: 'encoded',
		output: [0.735_356_983_052_449_5, 0.461_356_129_500_441_64, 0.954_687_171_885_866_2]
	},
	{
		id: 'color.srgbTransferInv',
		inputKey: 'encoded',
		input: [0.040_449_936, 0.012_92, 0.006_46],
		outputKey: 'linear',
		output: [0.003_130_8, 0.001, 0.000_5]
	},
	{
		id: 'color.srgbTransferInv',
		inputKey: 'encoded',
		input: [1, 0, 0],
		outputKey: 'linear',
		output: [1, 0, 0]
	}
];
