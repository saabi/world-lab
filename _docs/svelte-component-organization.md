# Svelte Component Script Organization

Guidelines for structuring `.svelte` files in `fe/src/lib/planet/components/` (and route-level Svelte under `fe/src/routes/`). Pattern extracted from the escriba_finanzas component library (`app/src/lib/components/`, `docs/SVELTE_GUIDELINES.md`).

**Scope:** TypeScript in the two `<script>` blocks. Svelte 5 runes and `onclick` / `onpointerdown` event attributes are required — see `AGENTS.md` (Svelte 5 events rule).

**Out of scope:** `fe/src/lib/old/` — frozen reference; do not refactor unless fixing regressions.

---

## Why two script blocks?

| Block | Attribute | Runs | Holds |
|-------|-----------|------|-------|
| **Module script** | `<script module lang="ts">` | Once per module import | Imports, types, static constants, `export` types |
| **Instance script** | `<script lang="ts">` | Per component instance | Props, reactive state, effects, refs, handlers |

The module block is the component's contract; the instance block is its per-mount behavior. Large viewports (`PlanetViewport.svelte`, `SceneViewport3D.svelte`) benefit most from this split.

---

## File layout

```text
<script module lang="ts">   … contract …
<script lang="ts">          … instance logic …
<!-- markup -->
<style>                     … scoped styles …
```

---

## Module script (`<script module lang="ts">`)

### Sections (in order)

1. `// ===== IMPORTS =====`
2. `// ===== TYPES =====` — `interface Props`, re-exported shapes, `export type` for consumers
3. `// ===== STATIC CONSTANTS =====` — values independent of props/state

### Rules

- **Props interface here**, not in the instance script.
- Import domain types from `lib/planet/params/`, `lib/planet/scene/types.ts`, `documents/types.ts`, etc. Do not copy large param structs into `.svelte` files.
- **Export** types from module script when parent panels import them from the component file.
- Static constants: tessellation defaults used as literals, panel labels, timing constants that do not read runes.

### Example (control primitive)

```svelte
<script module lang="ts">
	// ===== TYPES =====
	interface Props {
		id?: string;
		label: string;
		value: number;
		min: number | string;
		max: number | string;
		step: number | string;
		disabled?: boolean;
	}
</script>
```

---

## Instance script (`<script lang="ts">`)

### Sections (strict order)

Omit empty sections; preserve order when present.

| # | Comment | Contents |
|---|---------|----------|
| 1 | `// ===== IMPORTS =====` | Instance-only imports (rare) |
| 2 | `// ===== PROPS =====` | `let { … }: Props = $props()` / `$bindable()` |
| 3 | `// ===== STATE =====` | `$state(…)` |
| 4 | `// ===== DERIVED =====` | `$derived(…)` |
| 5 | `// ===== EFFECTS =====` | `$effect(…)` |
| 6 | `// ===== INSTANCE CONSTANTS =====` | One-time setup from props |
| 7 | `// ===== REFS =====` | Canvas/DOM refs |
| 8 | `// ===== LIFECYCLE =====` | `onMount`, `onDestroy` |
| 9 | `// ===== FUNCTIONS =====` | Handlers → utilities → `async` |

### Rules

- Props section first (after optional instance imports).
- No `interface` / `type` in instance script.
- No static constants in instance script — move to module script or a pure `.ts` module under `lib/planet/`.
- Lifecycle hooks before FUNCTIONS.
- Prefer keeping heavy logic in `lib/planet/` pure modules; instance script wires runes to those modules (matches architecture in `AGENTS.md`).

### Example (`controls/Range.svelte` target shape)

```svelte
<script module lang="ts">
	// ===== TYPES =====
	interface Props {
		id?: string;
		label: string;
		value: number;
		min: number | string;
		max: number | string;
		step: number | string;
		disabled?: boolean;
	}
</script>

<script lang="ts">
	// ===== PROPS =====
	let { id, label, value = $bindable(), min, max, step, disabled = false }: Props = $props();

	// ===== DERIVED =====
	const inputId = $derived(id ?? label);
	const formattedValue = $derived(format(value));

	// ===== FUNCTIONS =====
	function format(n: number): number {
		if (!Number.isFinite(n)) return 0;
		if (n === 0) return 0;
		return Number(n.toPrecision(3));
	}
</script>
```

---

## Exceptions

### Pure `.ts` logic stays in `lib/planet/`

Camera math, patch scheduling, document I/O, and GPU frame assembly belong in TypeScript modules, not in `.svelte` scripts. Viewports may still have long instance blocks for the render loop — organize them with section comments; extract new pure helpers to `.ts` files instead of growing the script.

### Instance-script imports

Default: all imports in module script. Second `IMPORTS` section in the instance block only when required (rare).

### Monolithic viewports

`PlanetViewport.svelte` and similar files: migrate in dedicated PRs.

1. PR A — add module script; move imports, local interfaces, and file-level constants.
2. PR B — reorder instance sections without behavior changes.
3. PR C+ — extract chunks to `.ts` where appropriate (optional, separate from organization).

Do not mix organization refactors with rendering or persistence changes in the same PR.

### `fe/src/lib/old/`

Do not apply this procedure to legacy `/old` components except to fix breakage.

---

## Procedure: reformat an existing component

### 1. Inventory

For the target `.svelte` file, list imports, types, constants, props, state, derived, effects, lifecycle, functions, and refs.

### 2. Add module script

Insert `<script module lang="ts">` as the first block.

Move:

- imports (except documented exceptions);
- inline `$props<{…}>()` → `interface Props`;
- top-level `const` that do not depend on props/state.

### 3. Rebuild instance script

Reorder remaining code into the section table above. Type props with `Props` from module script.

### 4. Verify

```sh
export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
cd fe
npm run check
```

For viewports and editors, manually verify `/planet` or `/scene/...` after refactor.

### 5. Before / after (`controls/Range.svelte`)

**Before (current):**

```svelte
<script lang="ts">
	interface Props { … }
	let { id, label, value = $bindable(), … }: Props = $props();
	function format(n: number) { … }
	let formattedValue = $derived(format(value));
</script>
```

**After:** `Props` and any imports in module script; instance script sections PROPS → DERIVED → FUNCTIONS.

### 6. Rollout priority

| Priority | Files | Rationale |
|----------|-------|-----------|
| 1 | `controls/Range.svelte`, `controls/LogRange.svelte`, `controls/CheckBox.svelte` | Small, repeated pattern |
| 2 | `EditorParamSection.svelte`, `SchemaForm.svelte`, `*Editor.svelte` panels | Shared editor shell |
| 3 | `SystemTreePanel.svelte`, `SceneTreePanel.svelte`, `SystemMapPanel.svelte` | Medium complexity |
| 4 | `PlanetViewport.svelte`, `SceneViewport3D.svelte` | Large; split PRs |

- **New components:** two-script layout from day one.
- **Bugfix-only touches:** optional deferral; add TODO or follow-up issue.

---

## Review checklist

### Module script

- [ ] Present on non-trivial components
- [ ] `lang="ts"`
- [ ] Imports, `Props`, static constants, exported types only

### Instance script

- [ ] Ordered sections with comments
- [ ] No duplicate types or static constants
- [ ] Lifecycle before FUNCTIONS
- [ ] Heavy logic delegated to `lib/planet/` where possible

### Project gates

- [ ] `npm run check` passes
- [ ] No `on:click` / `export let` / `$:` (Svelte 4 patterns)
- [ ] Wave integration: organization-only PRs should not change `patches/types.ts`, `params/planetParams.ts`, or `render/RenderBackend.ts` contracts

---

## Reference implementations

**escriba_finanzas** (`app/src/lib/components/`):

| Pattern | File |
|---------|------|
| Props-only UI | `ui/Button.svelte` |
| Effects + refs | `ui/Select.svelte`, `app/AppHeader.svelte` |
| Exported types | `ui/Table.svelte` |

**virtual_planet** targets after migration: `controls/Range.svelte`, `EditorParamSection.svelte`, `SchemaForm.svelte`.
