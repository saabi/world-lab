import type { CoercionPlan, CpuValue } from '@world-lab/graph';

export function applyCoercion(plan: CoercionPlan, value: CpuValue): CpuValue {
	switch (plan.kind) {
		case 'identity':
			return value;
		case 'vector-pad-zero':
			if (!Array.isArray(value) || value.length !== plan.fromWidth) {
				throw new Error(`Expected vec${plan.fromWidth} value for coercion`);
			}
			return [value[0]!, value[1]!, 0];
	}
}
