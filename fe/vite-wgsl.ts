import fs from 'node:fs';
import path from 'node:path';
import type { ModuleNode, Plugin } from 'vite';

const WGSL_EXT = /\.wgsl$/;
const INCLUDE_RE = /^#include\s+"([^"]+)"/gm;

function escapeTemplateLiteral(source: string): string {
	return source.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

function resolveIncludes(
	source: string,
	basedir: string,
	includes: Set<string>,
	seen = new Set<string>()
): string {
	return source.replace(INCLUDE_RE, (_match, includePath: string) => {
		const resolved = path.resolve(basedir, includePath);
		includes.add(resolved);
		if (seen.has(resolved)) {
			return '';
		}
		seen.add(resolved);
		const content = fs.readFileSync(resolved, 'utf-8');
		return resolveIncludes(content, path.dirname(resolved), includes, seen);
	});
}

/** Inline `#include "…"` directives for imported WGSL shader files. */
export function wgsl(): Plugin {
	// Reverse dependency map: included file → set of importer ids that pulled it in.
	const importersByInclude = new Map<string, Set<string>>();

	return {
		name: 'vite-wgsl',
		transform(code, id) {
			if (!WGSL_EXT.test(id)) return null;
			const includes = new Set<string>();
			const resolved = resolveIncludes(code, path.dirname(id), includes);
			// Register every transitively-included file as a watched dependency so a
			// change to an `#include`d shader invalidates this importing module.
			for (const inc of includes) {
				this.addWatchFile(inc);
				let importers = importersByInclude.get(inc);
				if (!importers) {
					importers = new Set();
					importersByInclude.set(inc, importers);
				}
				importers.add(id);
			}
			return {
				code: `export default \`${escapeTemplateLiteral(resolved)}\`;`
			};
		},
		handleHotUpdate(ctx) {
			if (!WGSL_EXT.test(ctx.file)) return;
			const importers = importersByInclude.get(ctx.file);
			if (!importers || importers.size === 0) return;
			// The changed file is an `#include` target — also reload the shaders that
			// inline it, since their transform output is now stale.
			const affected: ModuleNode[] = [...ctx.modules];
			for (const importerId of importers) {
				for (const mod of ctx.server.moduleGraph.getModulesByFile(importerId) ?? []) {
					affected.push(mod);
				}
			}
			return affected;
		}
	};
}
