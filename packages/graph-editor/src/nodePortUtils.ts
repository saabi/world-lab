import {
	dedupeCanonicalSemantics,
	resolvePortType,
	paramInputPorts,
	type NodePrimitive,
	type Port,
	type PortSpec
} from '@world-lab/graph';

export function instantiatePorts(specs: readonly PortSpec[], direction: 'in' | 'out'): Port[] {
	return specs.map((spec) => ({
		id: spec.name,
		name: spec.name,
		direction,
		type: resolvePortType(spec),
		...(spec.dataType !== undefined ? { dataType: spec.dataType } : {}),
		space: spec.space ?? 'none',
		...(spec.semantics !== undefined
			? { semantics: dedupeCanonicalSemantics(spec.semantics) }
			: {}),
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
