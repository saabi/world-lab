/** Lucide-style 24×24 stroke icons (MIT). Paths use currentColor at render time. */
export type TabIconId =
	| 'move-3d'
	| 'component'
	| 'route'
	| 'orbit'
	| 'layers'
	| 'cloud'
	| 'zap'
	| 'eye'
	| 'gauge'
	| 'bug'
	| 'sun';

export interface TabIconDef {
	viewBox: string;
	paths: string[];
}

export const TAB_ICONS: Record<TabIconId, TabIconDef> = {
	'move-3d': {
		viewBox: '0 0 24 24',
		paths: [
			'<path d="M5 3v4"/><path d="M3 5h4"/><path d="M19 3v4"/><path d="M17 5h4"/><path d="M5 17v4"/><path d="M3 19h4"/><path d="M19 17v4"/><path d="M17 19h4"/><path d="M9 9h6v6H9z"/>'
		]
	},
	component: {
		viewBox: '0 0 24 24',
		paths: [
			'<path d="M15.536 11.293 12 8.5l-3.536 2.793"/><path d="M12 2v6.5"/><path d="M19.07 10.929a8 8 0 1 1-14.14 0"/><path d="m12 17.5-3.536 2.793L12 23l3.536-2.707L12 17.5z"/>'
		]
	},
	route: {
		viewBox: '0 0 24 24',
		paths: [
			'<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>'
		]
	},
	orbit: {
		viewBox: '0 0 24 24',
		paths: [
			'<circle cx="12" cy="12" r="3"/><path d="M12 2a10 10 0 0 1 10 10"/><path d="M12 22a10 10 0 0 1-10-10"/>'
		]
	},
	layers: {
		viewBox: '0 0 24 24',
		paths: [
			'<path d="M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83z"/><path d="M2 12a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 12"/><path d="M2 17a1 1 0 0 0 .58.91l8.6 3.91a2 2 0 0 0 1.65 0l8.58-3.9A1 1 0 0 0 22 17"/>'
		]
	},
	cloud: {
		viewBox: '0 0 24 24',
		paths: ['<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>']
	},
	zap: {
		viewBox: '0 0 24 24',
		paths: ['<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13.5 10H20a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 10.5 14z"/>']
	},
	eye: {
		viewBox: '0 0 24 24',
		paths: [
			'<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>'
		]
	},
	gauge: {
		viewBox: '0 0 24 24',
		paths: [
			'<path d="m12 14 4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/>'
		]
	},
	bug: {
		viewBox: '0 0 24 24',
		paths: [
			'<path d="M12 20v-9"/><path d="M4.1 8.5a9 9 0 0 1 15.8 0"/><path d="M3 8.5h4"/><path d="M17 8.5h4"/><path d="M12 4v1"/><path d="M6 3l1.5 1.5"/><path d="M18 3l-1.5 1.5"/><path d="m9 14 1.5 1.5"/><path d="m15 14-1.5 1.5"/>'
		]
	},
	sun: {
		viewBox: '0 0 24 24',
		paths: [
			'<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>'
		]
	}
};
