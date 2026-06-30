import { createPaneId, type LayoutDocument } from '@virtual-planet/subdivide';

/** The editor's default pane tree (zones: palette, canvas, preview, code, compiled, inspector, validation, markup). */
export function defaultGraphEditorLayout(): LayoutDocument {
	return {
		root: {
			type: 'group',
			row: true,
			pos: 0,
			size: 1,
			children: [
				{
					type: 'pane',
					id: createPaneId(),
					zone: 'palette',
					pos: 0,
					size: 0.16
				},
				{
					type: 'group',
					row: false,
					pos: 0.16,
					size: 0.58,
					children: [
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'canvas',
							pos: 0,
							size: 0.62
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'preview',
							pos: 0.62,
							size: 0.2
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'code',
							pos: 0.82,
							size: 0.09
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'compiled',
							pos: 0.91,
							size: 0.09
						}
					]
				},
				{
					type: 'group',
					row: false,
					pos: 0.74,
					size: 0.26,
					children: [
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'inspector',
							pos: 0,
							size: 0.52
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'validation',
							pos: 0.52,
							size: 0.24
						},
						{
							type: 'pane',
							id: createPaneId(),
							zone: 'markup',
							pos: 0.76,
							size: 0.24
						}
					]
				}
			]
		}
	};
}
