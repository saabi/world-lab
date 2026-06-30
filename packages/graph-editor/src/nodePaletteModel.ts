import type { NodePrimitive } from '@virtual-planet/graph';
import { swapFamily } from '@virtual-planet/graph';

export type PaletteMode = 'section' | 'contract' | 'both';

export interface PaletteGroup {
	key: string;
	label: string;
	primitives: NodePrimitive[];
	subgroups?: PaletteGroup[];
}

function sortPrimitives(primitives: NodePrimitive[]): NodePrimitive[] {
	return [...primitives].sort((left, right) => left.id.localeCompare(right.id));
}

function sectionHead(category: string): string {
	return category.split('/').filter(Boolean)[0] ?? category;
}

function sectionTailLabel(category: string): string {
	const parts = category.split('/').filter(Boolean);
	return parts[parts.length - 1] ?? category;
}

/** Human label for a contract / swap-family group. */
export function contractGroupLabel(primitive: NodePrimitive): string {
	const role = primitive.metadata?.role;
	if (role) {
		return role.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
	}
	return swapFamily(primitive);
}

function primitiveHaystack(primitive: NodePrimitive): string {
	return [
		primitive.id,
		primitive.category,
		primitive.metadata?.description ?? '',
		...(primitive.metadata?.keywords ?? [])
	]
		.join(' ')
		.toLowerCase();
}

/** Case-insensitive substring / token match across id, category, keywords, and description. */
export function filterPrimitives(primitives: NodePrimitive[], query: string): NodePrimitive[] {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return primitives;

	const tokens = normalized.split(/\s+/).filter(Boolean);
	return primitives.filter((primitive) => {
		const haystack = primitiveHaystack(primitive);
		if (haystack.includes(normalized)) return true;
		return tokens.every((token) => haystack.includes(token));
	});
}

function groupByContract(primitives: NodePrimitive[]): PaletteGroup[] {
	const buckets = new Map<string, NodePrimitive[]>();
	for (const primitive of primitives) {
		const key = swapFamily(primitive);
		const bucket = buckets.get(key) ?? [];
		bucket.push(primitive);
		buckets.set(key, bucket);
	}

	return [...buckets.entries()]
		.map(([key, items]) => {
			const sorted = sortPrimitives(items);
			return {
				key,
				label: contractGroupLabel(sorted[0]!),
				primitives: sorted
			};
		})
		.sort(
			(left, right) =>
				right.primitives.length - left.primitives.length ||
				left.label.localeCompare(right.label)
		);
}

function groupBySection(primitives: NodePrimitive[]): PaletteGroup[] {
	const byCategory = new Map<string, NodePrimitive[]>();
	for (const primitive of primitives) {
		const bucket = byCategory.get(primitive.category) ?? [];
		bucket.push(primitive);
		byCategory.set(primitive.category, bucket);
	}

	const topLevel = new Map<string, PaletteGroup>();

	for (const [category, items] of byCategory) {
		const sorted = sortPrimitives(items);
		const parts = category.split('/').filter(Boolean);
		if (parts.length <= 1) {
			topLevel.set(category, {
				key: category,
				label: sectionTailLabel(category),
				primitives: sorted
			});
			continue;
		}

		const head = parts[0]!;
		let section = topLevel.get(head);
		if (!section) {
			section = { key: head, label: head, primitives: [], subgroups: [] };
			topLevel.set(head, section);
		}
		section.subgroups = section.subgroups ?? [];
		section.subgroups.push({
			key: category,
			label: sectionTailLabel(category),
			primitives: sorted
		});
	}

	return [...topLevel.values()]
		.map((group) => ({
			...group,
			primitives: sortPrimitives(group.primitives),
			subgroups: group.subgroups?.sort((left, right) => left.label.localeCompare(right.label))
		}))
		.sort((left, right) => left.label.localeCompare(right.label));
}

function groupByBoth(primitives: NodePrimitive[]): PaletteGroup[] {
	const bySection = new Map<string, NodePrimitive[]>();
	for (const primitive of primitives) {
		const key = sectionHead(primitive.category);
		const bucket = bySection.get(key) ?? [];
		bucket.push(primitive);
		bySection.set(key, bucket);
	}

	return [...bySection.entries()]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([sectionKey, items]) => ({
			key: sectionKey,
			label: sectionKey,
			primitives: [],
			subgroups: groupByContract(items)
		}));
}

export function groupPrimitives(primitives: NodePrimitive[], mode: PaletteMode): PaletteGroup[] {
	switch (mode) {
		case 'section':
			return groupBySection(primitives);
		case 'contract':
			return groupByContract(primitives);
		case 'both':
			return groupByBoth(primitives);
		default: {
			const _exhaustive: never = mode;
			return _exhaustive;
		}
	}
}

/** Whether a group or any nested subgroup contains a filtered primitive. */
export function paletteGroupHasMatch(group: PaletteGroup, visibleIds: ReadonlySet<string>): boolean {
	if (group.primitives.some((primitive) => visibleIds.has(primitive.id))) return true;
	return group.subgroups?.some((subgroup) => paletteGroupHasMatch(subgroup, visibleIds)) ?? false;
}

/** Drop groups with no visible primitives (after search). */
export function filterPaletteGroups(
	groups: PaletteGroup[],
	visibleIds: ReadonlySet<string>
): PaletteGroup[] {
	const filtered: PaletteGroup[] = [];
	for (const group of groups) {
		if (!paletteGroupHasMatch(group, visibleIds)) continue;
		filtered.push({
			...group,
			primitives: group.primitives.filter((primitive) => visibleIds.has(primitive.id)),
			subgroups: group.subgroups
				? filterPaletteGroups(group.subgroups, visibleIds)
				: undefined
		});
	}
	return filtered;
}

/** Count primitives in a group including nested subgroups. */
export function paletteGroupCount(group: PaletteGroup): number {
	return (
		group.primitives.length +
		(group.subgroups?.reduce((sum, subgroup) => sum + paletteGroupCount(subgroup), 0) ?? 0)
	);
}

/** Badge text for a primitive row in the current palette mode. */
export function primitiveBadge(primitive: NodePrimitive, mode: PaletteMode): string {
	if (mode === 'contract' || mode === 'both') {
		return contractGroupLabel(primitive);
	}
	return primitive.category;
}
