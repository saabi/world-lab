#!/usr/bin/env node
// @sveltejs/package has no built-in test-file exclusion (colocated *.test.ts
// sources get compiled into dist/ verbatim, and a `src/test/` harness-component
// convention gets copied too). Run after `svelte-package` to strip both before
// the package is packed. Usage: node ../../scripts/clean-package-dist-tests.mjs <dist-dir>
import { readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) {
	console.error('usage: clean-package-dist-tests.mjs <dist-dir>');
	process.exit(1);
}

let removed = 0;

function walk(current) {
	for (const name of readdirSync(current)) {
		const full = join(current, name);
		const stats = statSync(full);
		if (stats.isDirectory()) {
			if (name === 'test') {
				rmSync(full, { recursive: true, force: true });
				removed++;
				continue;
			}
			walk(full);
		} else if (/\.test\.(js|d\.ts|js\.map|d\.ts\.map)$/.test(name)) {
			rmSync(full, { force: true });
			removed++;
		}
	}
}

walk(dir);
console.log(`clean-package-dist-tests: removed ${removed} test artifact(s) from ${dir}`);
