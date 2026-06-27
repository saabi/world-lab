import type { NodeEditor } from '$lib/planet/scene/nodeSchemas.js';
import type { SceneNode } from '$lib/planet/scene/types.js';
import type { TabIconId } from '@virtual-planet/editor-ui';

export type PropsSuperSectionId =
	| 'transform'
	| 'node'
	| 'motion'
	| 'display'
	| 'appearance'
	| 'atmosphere'
	| 'actions';

export interface PropsSectionDef {
	id: PropsSuperSectionId;
	title: string;
	icon: TabIconId;
	defaultOpen?: boolean;
}

export const PROPS_SUPER_SECTIONS: PropsSectionDef[] = [
	{ id: 'transform', title: 'Transform', icon: 'move-3d', defaultOpen: true },
	{ id: 'node', title: 'Node', icon: 'component' },
	{ id: 'motion', title: 'Motion', icon: 'route' },
	{ id: 'display', title: 'Display', icon: 'orbit' },
	{ id: 'appearance', title: 'Appearance', icon: 'layers' },
	{ id: 'atmosphere', title: 'Atmosphere', icon: 'cloud' },
	{ id: 'actions', title: 'Actions', icon: 'zap' }
];

export interface PropsSectionContext {
	hasAppearance: boolean;
	hasDriver: boolean;
	editor: NodeEditor | null;
}

export function visiblePropsSections(
	node: SceneNode,
	ctx: PropsSectionContext
): PropsSuperSectionId[] {
	const out: PropsSuperSectionId[] = ['transform'];

	if (ctx.editor?.mode === 'schema') {
		out.push('node');
	}

	out.push('motion');

	if (node.driver?.type === 'kepler' || node.orbit) {
		out.push('display');
	}

	if (ctx.hasAppearance) {
		out.push('appearance', 'atmosphere', 'actions');
	}

	return out;
}

export function defaultOpenPropsSection(visible: PropsSuperSectionId[]): PropsSuperSectionId {
	return visible.includes('transform') ? 'transform' : visible[0] ?? 'transform';
}
