import { Type } from '@virtual-planet/schema';

import type { NodePrimitive } from '../primitive.js';
import { registerPrimitive } from '../registry.js';

const metricPosition: NodePrimitive = {
	id: 'procedural.metricPosition',
	category: 'procedural',
	inputs: [],
	outputs: [{ name: 'position', dataType: 'vec3f', space: 'none' }],
	params: Type.Object({}),
	wgsl: { moduleId: 'procedural.metricPosition', entry: 'metricPosition' },
	evalCPU(ctx) {
		const position = ctx.procedural?.metricPosition;
		if (position === undefined || !Array.isArray(position) || position.length < 3) {
			return { position: [0, 0, 0] };
		}
		return { position: [...position] };
	}
};

registerPrimitive(metricPosition);
