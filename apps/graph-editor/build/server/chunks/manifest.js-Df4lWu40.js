const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set([]),
	mimeTypes: {},
	_: {
		client: {start:"_app/immutable/entry/start.Cgi_K3Hq.js",app:"_app/immutable/entry/app.BQCCXlaU.js",imports:["_app/immutable/entry/start.Cgi_K3Hq.js","_app/immutable/chunks/Cj_V42lW.js","_app/immutable/chunks/Q8dolxpx.js","_app/immutable/entry/app.BQCCXlaU.js","_app/immutable/chunks/Q8dolxpx.js","_app/immutable/chunks/kNaey6uv.js","_app/immutable/chunks/xihTtKlq.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./nodes/0.js-okeg95bl.js')),
			__memo(() => import('./nodes/1.js-BkAuUL_b.js')),
			__memo(() => import('./nodes/2.js-BrA61dMx.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,], errors: [1,], leaf: 2 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

export { manifest as m };
//# sourceMappingURL=manifest.js-Df4lWu40.js.map
