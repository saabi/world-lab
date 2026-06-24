import { createPaneId } from './id.js';
import type { LayoutDocument } from './types.js';

export function createDefaultLayout(zone = 'default'): LayoutDocument {
	return {
		root: {
			type: 'group',
			row: false,
			pos: 0,
			size: 1,
			children: [
				{
					type: 'pane',
					id: createPaneId(),
					zone,
					pos: 0,
					size: 1
				}
			]
		}
	};
}

/** Column: main row (left stack | viewport) + flight deck along the bottom. */
export function defaultSceneEditorLayout(): LayoutDocument {
	return {
		root: {
			type: 'group',
			row: false,
			pos: 0,
			size: 1,
			children: [
				{
					type: 'group',
					row: true,
					pos: 0,
					size: 0.78,
					children: [
						{
							type: 'group',
							row: false,
							pos: 0,
							size: 0.22,
							children: [
								{
									type: 'pane',
									id: createPaneId(),
									zone: 'outliner',
									pos: 0,
									size: 0.45
								},
								{
									type: 'pane',
									id: createPaneId(),
									zone: 'properties',
									pos: 0.45,
									size: 0.4
								},
								{
									type: 'pane',
									id: createPaneId(),
									zone: 'renderSettings',
									pos: 0.85,
									size: 0.15
								}
							]
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'viewport',
							pos: 0.22,
							size: 0.78
						}
					]
				},
				{
					type: 'pane',
					id: createPaneId(),
					zone: 'flight',
					pos: 0.78,
					size: 0.22
				}
			]
		}
	};
}
