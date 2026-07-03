import type { CoercionPlan } from '@world-lab/graph';

export function emitCoercion(plan: CoercionPlan, expr: string): string {
	switch (plan.kind) {
		case 'identity':
			return expr;
		case 'vector-pad-zero':
			return `vec3<f32>(${expr}, 0.0)`;
	}
}
