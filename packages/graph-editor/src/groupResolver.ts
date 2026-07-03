import {
	getPrimitive,
	type GroupDefinition,
	type GroupResolver
} from '@world-lab/graph';

export async function resolvePrimitiveGroup(
	primitiveId: string,
	resolver: GroupResolver
): Promise<GroupDefinition | null> {
	const primitive = getPrimitive(primitiveId);
	if (!primitive || primitive.implementation.kind !== 'group') return null;
	return resolver.resolve(primitive.implementation.groupId);
}
