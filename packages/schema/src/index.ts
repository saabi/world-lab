// @virtual-planet/schema — schema/type-system extension for the scene model.
//
// Direction (see _docs/specs/scene-routing.md + the type-system discussion):
// a thin functional, curried, *plain-data* factory layer over TypeBox
// (`Type.*` returns introspectable JSON-Schema objects with static inference),
// enriched with domain annotations standard libraries lack — units (`intWithUnit`:
// km/kg/s), extents (min/max with UI intent), and path refs (`/methods/orbit`,
// `../`) for drivers + per-channel transform inheritance. One schema then serves
// four jobs: introspectable (UI/form generation), validatable (runtime), inferrable
// (static types), and serializable (mountable/swappable at runtime).
//
// Scaffold only — the TypeBox layer + domain factories land in the next step.

/** Package identity marker (placeholder until the schema factories land). */
export const SCHEMA_PACKAGE = '@virtual-planet/schema' as const;
