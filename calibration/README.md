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

## Round 4
+74 clearer tracks from Studio + CSE Extended (26 R&B Soul, 27 Peak Time Techno, 21 Reggaeton). Afrobeats / Baile Funk / Amapiano: no new files on either drive (Amapiano still only the Umbrella remix; Soul/Afro House/Amapiano Vocal crates empty). ~442 unique after basename dedupe.

Held-out family **49/103 (47.6%)** did **not** beat round 2’s published 20/34 (59%), so r4 was **not** pushed. Weight tweaks (texture/bass) topped out ~49.5% held — still under gate. R&B held 40% (mostly confused with Rap, not Afrobeats); Peak Techno held 17%. Live site stays on round 2 (`10509fa`).


## Round 5
+98 downloads from the YouTube list (`uploads/r5/`): Afrobeats 19, R&B Soul 12, Amapiano 10, Hip Hop 10, House Dance 10 (new crate → generic `house` profile), Peak Time Techno 10, Reggae 10, Moombahton 9, Tech House 8. 540 tracks total (533 usable).

Two new harmonic features (`tonal`: 12-bin chroma peakiness 100–2000 Hz; `vocalMid`: 300–3000 Hz power share). Old raw features re-extracted and verified identical. Unfitted estimate profiles skip the new features. Weights picked by 5-fold CV on the training split only (`tune_cv.js`).

**Fair gate** (`node calibration/compare.js`, same stratified holdout of 126, live = `10509fa` profiles + weights):
- Live round 2: 46/126 (37%) family. On the 110 held tracks live never trained on: 36/110.
- Round 5: 60/126 (48%) family, 48/126 subgenre. On those 110: 51/110.
- Paired: 30 tracks only r5 gets right vs 16 only live gets right (McNemar χ² 3.67).
Round 2’s published 59% was on its own 34-track holdout, not comparable.
