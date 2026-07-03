import { paramInputPorts, type NodePrimitive, type Port, type PortSpec } from '@world-lab/graph';

function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		dataType: spec.dataType,
		space: spec.space ?? 'none',
		...(spec.default !== undefined ? { default: spec.default } : {})
	}));
}

/** Primitive input ports plus synthetic ports for promotable params. */
export function instantiateNodeInputs(primitive: NodePrimitive): Port[] {
	return [
		...instantiatePorts(primitive.inputs, 'in'),
		...instantiatePorts(paramInputPorts(primitive), 'in')
	];
}

export function instantiateNodeOutputs(primitive: NodePrimitive): Port[] {
	return instantiatePorts(primitive.outputs, 'out');
}
