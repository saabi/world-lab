/// <reference types="@webgpu/types" />
/// <reference types="@sveltejs/kit" />

import type { HTMLAttributes as SvelteElementHTMLAttributes } from 'svelte/elements';
import type { SVGAttributes as SvelteElementSVGAttributes } from 'svelte/elements';

declare global {
	namespace svelteHTML {
		interface HTMLAttributes<T extends EventTarget = any>
			extends SvelteElementHTMLAttributes<T> {}
		interface SVGAttributes<T extends EventTarget = any>
			extends SvelteElementSVGAttributes<T> {}
	}

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
