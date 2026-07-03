import { Type } from '@world-lab/schema';

import type { NodePrimitiveInput } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const metricPosition: NodePrimitiveInput = {
	id: 'procedural.metricPosition',
	category: 'procedural',
	inputs: [],
	outputs: [{ name: 'position', dataType: 'vec3f', space: 'none' }],
	params: Type.Object({}),
	implementation: {
		kind: 'host-input',
		binding: { context: 'invocation', key: 'metricPosition' }
	},
	metadata: {
		help: 'World/metric position from the procedural evaluation context.'
	},
	evalCPU(ctx) {
		const position = ctx.procedural?.metricPosition;
		if (position === undefined || !Array.isArray(position) || position.length < 3) {
			return { position: [0, 0, 0] };
		}
		return { position: [...position] };
	}
};

registerPrimitive(metricPosition);
