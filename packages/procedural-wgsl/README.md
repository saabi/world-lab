# @world-lab/procedural-wgsl

Standard library of reusable WGSL modules (noise, math, SDF operations, color) plus the
`#include`-style module resolver [`@world-lab/compiler`](../compiler) uses to assemble them
into a single compiled shader.

```ts
import { STANDARD_LIBRARY_MODULES, createStandardLibraryResolver } from '@world-lab/procedural-wgsl';
```

Modules are plain WGSL source with a declared dependency list (`src/modules/*`); the resolver
topologically orders and dedupes includes across a graph compilation. `src/groups/*` builds
higher-level composite modules (multi-primitive "groups") using `@world-lab/compiler`'s
`WgslModule`/codegen helpers and `@world-lab/graph`/`@world-lab/schema` types — so this
package and the compiler depend on each other's types rather than being strictly one-way:
the compiler resolves includes through this package's modules at compile time, and this
package's group-building code uses the compiler's codegen utilities to construct them.

See `_docs/architecture/procedural-graph/wgsl-parsing-and-codegen.md` for how module
resolution fits into the wider compilation pipeline.
