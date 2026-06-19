// @virtual-planet/schema — schema/type-system extension for the scene model.
//
// A thin functional, curried, plain-data factory layer over TypeBox (`Type.*`
// returns introspectable JSON-Schema objects with static inference), enriched with
// domain annotations standard libraries lack — units (`quantity`), extents, and
// path refs (`ref`). One schema serves four jobs: introspectable (UI/form gen),
// validatable (runtime), inferrable (static types), serializable (mountable at
// runtime). See _docs/specs/scene-routing.md.

/** Package identity marker. */
export const SCHEMA_PACKAGE = '@virtual-planet/schema' as const;

export * from './schema.js';
