#!/usr/bin/env node
// OS4 gate: "a clean consumer smoke test that installs packed tarballs outside the
// monorepo." Builds every publishable packages/* library, packs each into a real .tgz,
// installs all of them together into a scratch npm project OUTSIDE this repo (so
// workspace symlinks/hoisting can't paper over a broken package.json), then imports
// and calls a real function from each to prove the published dist/ output actually
// works standalone. Run: node scripts/consumer-smoke-test.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

const packages = [
	'schema',
	'graph',
	'compiler',
	'procedural-wgsl',
	'runtime-cpu',
	'runtime-webgpu',
	'graph-editor',
	'editor-ui',
	'subdivide',
	'mcp-server'
];

function run(cmd, args, cwd, { capture = true } = {}) {
	return execFileSync(cmd, args, {
		cwd,
		encoding: 'utf8',
		stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit'
	});
}

console.log('Building all packages/* (clean-checkout equivalent)...');
run('npm', ['run', 'build:packages'], repoRoot);

const scratch = mkdtempSync(join(tmpdir(), 'world-lab-pack-smoke-'));
const tarballDir = join(scratch, 'tarballs');
const consumerDir = join(scratch, 'consumer');
mkdirSync(tarballDir);
mkdirSync(consumerDir);

console.log(`Packing ${packages.length} packages into ${tarballDir}...`);
const tarballPaths = packages.map((pkg) => {
	const out = run('npm', ['pack', '--pack-destination', tarballDir], join(repoRoot, 'packages', pkg)).trim();
	return join(tarballDir, out.split('\n').pop());
});

writeFileSync(
	join(consumerDir, 'package.json'),
	JSON.stringify({ name: 'world-lab-smoke-test-consumer', version: '1.0.0', private: true, type: 'module' }, null, 2)
);

console.log('Installing packed tarballs into a scratch project outside the repo...');
run('npm', ['install', ...tarballPaths, 'svelte'], consumerDir);

const smokeTestSource = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const checks = [];
function check(name, fn) {
	checks.push(Promise.resolve().then(fn).then(() => [name, 'ok']).catch((err) => [name, \`FAIL: \${err.message}\`]));
}
check('@world-lab/schema', async () => {
	const { Type, quantity } = await import('@world-lab/schema');
	assert.equal(typeof Type.Number, 'function');
	assert.equal(typeof quantity, 'function');
});
check('@world-lab/graph', async () => {
	const { getPrimitive } = await import('@world-lab/graph');
	assert.ok(getPrimitive('math.add'), 'math.add primitive should be registered via side-effecting import');
});
check('@world-lab/compiler', async () => {
	const mod = await import('@world-lab/compiler');
	assert.equal(typeof mod.compileGraph, 'function');
});
check('@world-lab/procedural-wgsl', async () => {
	const { STANDARD_LIBRARY_MODULES } = await import('@world-lab/procedural-wgsl');
	assert.ok(Object.keys(STANDARD_LIBRARY_MODULES).length > 0);
});
check('@world-lab/runtime-cpu', async () => {
	const { evaluateGraphOutput } = await import('@world-lab/runtime-cpu');
	assert.equal(typeof evaluateGraphOutput, 'function');
});
check('@world-lab/runtime-webgpu', async () => {
	const mod = await import('@world-lab/runtime-webgpu');
	assert.ok(Object.keys(mod).length > 0);
});
check('@world-lab/subdivide', async () => {
	const { createDefaultLayout, buildRuntimeTree } = await import('@world-lab/subdivide');
	const { root } = buildRuntimeTree(createDefaultLayout());
	assert.ok(root);
});
check('@world-lab/mcp-server', async () => {
	const { listPrimitives } = await import('@world-lab/mcp-server');
	assert.ok(Array.isArray(listPrimitives()) && listPrimitives().length > 0);
});
for (const [pkg, files] of Object.entries({
	'@world-lab/editor-ui': ['./Section.svelte', './controls/SliderRow.svelte'],
	'@world-lab/subdivide': ['./Subdivide.svelte'],
	'@world-lab/graph-editor': ['./GraphEditor.svelte']
})) {
	for (const file of files) {
		check(\`\${pkg}\${file.slice(1)} (resolves + non-empty)\`, () => {
			const fs = require('node:fs');
			const content = fs.readFileSync(require.resolve(\`\${pkg}\${file.slice(1)}\`), 'utf8');
			assert.ok(content.includes('<script'));
		});
	}
}
const results = await Promise.all(checks);
let failed = 0;
for (const [name, status] of results) {
	console.log(\`\${status === 'ok' ? 'PASS' : 'FAIL'}  \${name}\${status === 'ok' ? '' : \`  — \${status}\`}\`);
	if (status !== 'ok') failed++;
}
console.log(\`\\n\${results.length - failed}/\${results.length} checks passed\`);
process.exit(failed > 0 ? 1 : 0);
`;
writeFileSync(join(consumerDir, 'smoke.mjs'), smokeTestSource);

console.log('Running smoke test (with the "svelte" resolution condition, matching a real Vite consumer)...');
try {
	run('node', ['--conditions=svelte', 'smoke.mjs'], consumerDir, { capture: false });
	console.log(`\nAll packages installed and imported successfully from ${consumerDir}`);
} finally {
	rmSync(scratch, { recursive: true, force: true });
}
