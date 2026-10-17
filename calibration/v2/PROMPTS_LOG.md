# Shima v3 prompts on pipeline-v2: what was kept

Holdout = the same 126 tracks as live. pipeline-v2 baseline: family 99, super 108, shelf 85. Live 020cef0: family 67.

## Prompt 3: fourOnFloor / hatDensity (DROPPED, no model change)
- fourOnFloor = acBeat + 0.6·acTwo + 0.35·acBar. hatDensity placeholder = 0.6·brightness + 0.4·pulse.
- Both are exact linear combinations of features the v2 heads already use (R² = 1.00), so adding them as features gives the linear heads nothing new.
- Correlations: fourOnFloor r = 0.93 with acBeat, 0.91 with regularity, 0.43 with b_fourFloor. The hat proxy has r = 0.94 with brightness and only 0.30 with our measured b_hatDensity.
- The hat proxy gets phonk backwards: phonk has the lowest proxy value (0.46) but the highest measured hat density among the rap shelves (0.60).
- Score bonus, tuned by 5-fold out-of-fold on the 407 training tracks: shelf accuracy is 255 at w = 0. The best bonus also gets 255, and larger weights lose up to 3 tracks (252).
- Not ported. Our groove features (b_fourFloor, b_kickDensity, b_hatDensity, hat16) already carry this, measured from the audio.

## Prompt 5: dev table + Techno vs House (table KEPT, both fixes DROPPED)
- `node calibration/v2/devtable.js rows.json yam.json [--held|--train|--all] [--pair Techno,House] [--json out]`. Dev only, not in the UI.
- Columns: bpm, file, expected, predicted, score gap (fused pp), mel gap, the feature groups that pushed predicted ahead of expected, and the features furthest from the expected shelf's training mean.
- Techno → House, 6 holdout errors. 4 are at 125–132 BPM: the Peak Time Techno crate's median is 125 BPM, the same as Tech House, so tempo can't separate them. 2 are half-time reads (62 and 71 BPM).
- Fix 1, per-shelf bias on Peak Time Techno: CV on training chose −0.3. Out-of-fold shelf accuracy went 255 → 258, but on the holdout family stayed 99, shelf stayed 85, and Techno → House stayed 6. Dropped: no effect.
- Fix 2, tempo folded out of half time as two extra hand features: training CV gave fused shelf 255 → 260 and train Techno → House 11 → 9.
  - Holdout fused: 99/108/85, Techno → House still 6.
  - Holdout without mel: family 90 → 88, super 101 → 98.
  - Dropped: it hurts the no-mel fallback.
- Next real step is more or cleaner techno labels, not hand-nudged targets.
