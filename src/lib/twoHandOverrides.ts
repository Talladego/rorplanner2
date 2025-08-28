// Overrides removed. Provide no-op functions so imports remain safe.

// Two-hand overrides removed from the codebase.
// Retain a tiny noop export to avoid breaking imports.
export function isTwoHandOverride(_id: string | undefined | null): boolean { return false }
export function addTwoHandOverride(_id: string) { /* noop */ }
// two-hand overrides removed
export default undefined
