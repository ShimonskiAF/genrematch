# Calibration

Round 1: 26 tracks in `/workspace/uploads/cal/`. Round 2: +170 in `/workspace/uploads/r2/` (~178 unique labelled after dedupe).
Audio is NOT in git. Only measured features (`features.json`) are stored.

    node tools/extract.js /path/to/crates... > calibration/features.json
    node calibration/calibrate.js --write
    node calibration/evaluate.js

Holdout is stratified ~25% per crate (`buildHoldout` in labels.js), fixed before fitting.
Crates with fewer than 3 training tracks are not fitted (estimate only). Acapellas and Open Format Mashups are skipped for fitting.
