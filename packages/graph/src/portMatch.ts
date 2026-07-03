import type { DataType } from './types.js';
import type { NodePrimitive } from './primitive.js';
import { listPrimitives } from './registry.js';
import { compatiblePortTypes } from './ports.js';

export interface PortMatch {
	primitive: NodePrimitive;
	portName: string;
}

/** Primitives with an input accepting `dataType` (for an output-port quick-connect). */
export function compatibleConsumers(dataType: DataType): PortMatch[] {
	const matches: PortMatch[] = [];
	for (const primitive of listPrimitives()) {
		for (const input of primitive.inputs) {
			if (compatiblePortTypes({ dataType }, input)) {
				matches.push({ primitive, portName: input.name });
				break;
			}
		}
	}
	return matches.sort((left, right) => left.primitive.id.localeCompare(right.primitive.id));
}

/** Primitives with an output feeding `dataType` (for an input-port quick-connect). */
export function compatibleProducers(dataType: DataType): PortMatch[] {
	const matches: PortMatch[] = [];
	for (const primitive of listPrimitives()) {
		for (const output of primitive.outputs) {
			if (compatiblePortTypes(output, { dataType })) {
				matches.push({ primitive, portName: output.name });
				break;
			}
		}
	}
	return matches.sort((left, right) => left.primitive.id.localeCompare(right.primitive.id));
}
