The local `test-isTwohanded.js` script that used client-side classifier heuristics has been removed.

The app now relies on the server-provided `slot` metadata for two-hand/either-hand/off-hand decisions.

If you need to run classification experiments, see `regress-*` and `probe-*` scripts in this directory.
