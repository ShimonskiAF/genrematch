# Shima v3 prompts on pipeline-v2: what was kept

Holdout = the same 126 tracks as live. pipeline-v2 baseline: family 99, super 108, shelf 85. Live 020cef0: family 67.

## Prompt 3: fourOnFloor / hatDensity (DROPPED, no model change)
- fourOnFloor = acBeat + 0.6·acTwo + 0.35·acBar. hatDensity placeholder = 0.6·brightness + 0.4·pulse.
- Both are exact linear combinations of features the v2 heads already use (R² = 1.00), so adding them as features gives the linear heads nothing new.
- Correlations: fourOnFloor r = 0.93 with acBeat, 0.91 with regularity, 0.43 with b_fourFloor. The hat proxy has r = 0.94 with brightness and only 0.30 with our measured b_hatDensity.
- The hat proxy gets phonk backwards: phonk has the lowest proxy value (0.46) but the highest measured hat density among the rap shelves (0.60).
- Score bonus, tuned by 5-fold out-of-fold on the 407 training tracks: shelf accuracy is 255 at w = 0. The best bonus also gets 255, and larger weights lose up to 3 tracks (252).
- Not ported. Our groove features (b_fourFloor, b_kickDensity, b_hatDensity, hat16) already carry this, measured from the audio.
