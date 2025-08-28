The deterministic two-handed classifier and related override/runtime coefficient files were removed from the codebase per project decision.

If you need to re-run any data-analysis or modeling scripts, see the other scripts in this folder that produce coefficient files (e.g. regress-on-dps*.js). However, the application now relies solely on server-provided `slot` metadata for two-hand/either-hand/off-hand decisions.

To reintroduce a classifier, add a new module under `src/lib/` and update `src/components/ItemPickerModal.tsx` to call it. Prefer obtaining authoritative two-hand metadata from the server instead of client-side heuristics.
