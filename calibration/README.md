# Calibration

Round 1: 26 tracks (`uploads/cal/`). Round 2: +170 (`uploads/r2/`). Round 3: +244 extended library (`uploads/ext/`) + 23 new downloads (`uploads/train/`). ~368 unique after basename dedupe.

Audio is NOT in git. Only measured features (`features.json`) are stored.

    node tools/extract.js /path/to/crates... > /tmp/new.json   # or tools/extract_one.js shards
    # merge + dedupe by basename into calibration/features.json
    node calibration/calibrate.js --write
    node calibration/evaluate.js

Holdout is stratified ~25% per crate (`buildHoldout` in labels.js). Crates with fewer than 3 training tracks are not fitted. Acapellas and Open Format Mashups are skipped for fitting.

## Round 3 gate
Held-out family 41/84 (48.8%) did **not** beat round 2’s published 20/34 (59%), so r3 was **not** pushed to master. Live site stays on round 2 (`10509fa`).
