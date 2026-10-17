# Round 6 retrain (branch r6, off master 7ab37f0). Not pushed.

**Data:** 81 new tracks (Shima's Round 6 list), root `r6`:

| Peak Time Techno | Trap | Soul | Neo-Soul | Alt R&B | Deep House | Phonk | Country | Cinematic |
|---|---|---|---|---|---|---|---|---|
| 15 | 14 | 10 | 8 | 10 | 6 | 6 | 6 | 6 |

- One Trap file arrived as `fix_prompt_3.md`, an mp3 of 144 s. It is probably Key Glock - Ambition For Cash but unverified, and was renamed.

**Holdouts:**
- The original 126 is frozen in `calibration/holdout_v1.json` and never trained on.
- Round 6 has its own ~30% stratified holdout: 25 tracks (labels.js `isHeldR6`).
- Training uses 463 tracks; both holdouts are excluded.

**Shelves:** Soul, Neo-Soul, Alt R&B, Deep House, Country and Cinematic are now fitted (24 classes). The R&B Soul crate stays as the `rnb` shelf, renamed "Contemporary R&B".

**Pipeline:**
- calibrate.js --write, then `layers/apply_groove.js`. This reuses the shipped drums_gate config (top-8 loop keys). drums_gate's pass/fail is no longer meaningful, because its v1 classifier collapses with the estimate shelves.
- fit_v2.py (CV picked melWeight 0.7), fit_fb.py + merge_fb.js, then bench --write-ood.
- OOD: YAMNet genre classes that map to a now-trained shelf (country, cinematic, soul) no longer count as out-of-domain evidence.

**YAMNet blend weight, 5-fold CV on training** (family by summed probability / exact / NLL):

| Weight | Family | Exact | NLL |
|---|---|---|---|
| 0.5 | 0.726 | 0.609 | 1.181 |
| 0.6 | 0.739 | 0.609 | 1.184 |
| 0.7 | 0.741 | 0.605 | 1.206 |

The fit_v2 rule (family sum, then NLL) picks 0.7.

**Old 126 holdout:**

| Path | Before (master) | After (r6) |
|---|---|---|
| With mel (family / super / exact) | 99 / 108 / 85 | 100 / 109 / 83 |
| Fallback | 92 / 102 / 80 | 91 / 101 / 77 |

**Round 6 holdout (25 tracks):**

| Path | Family | Super | Exact |
|---|---|---|---|
| With mel | 18 | 19 | 12 |
| Fallback | 24 | 24 | 14 |
