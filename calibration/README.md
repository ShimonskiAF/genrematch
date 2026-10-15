# Calibration (26 tracks from Shima's DJ library, rekordbox crates as labels)
Audio is NOT in git. Only the measured features are stored (features.json).

    node tools/extract.js /path/to/crates > calibration/features.json   # ffmpeg decode, 44.1 kHz mono, same analyser as the browser
    node calibration/evaluate.js                                         # current accuracy
    node calibration/tune.js                                             # leave-one-out on the training split
    node calibration/calibrate.js --write                                # refit data/genre_profiles.json

The held-out split (labels.js, 8 tracks, about 30%) was fixed before fitting and never used for fitting or tuning.
before.txt and after.txt hold the per-track results.
