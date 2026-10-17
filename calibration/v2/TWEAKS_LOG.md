# v2-tweaks (Shima plan, Priority 2), off master e67759b

Baseline holdout (126): family 99, super 108, exact 85. Confidence bands: high 67/75, medium 27/40, low 5/11.
Rule: tune on training CV only, look at the holdout once per item. Keep an item only if family or exact improves with no regression on Reggaeton, Hip Hop, Bass House or Tech House.

## A. Extra class weights, Trap and R&B (DROPPED)
- 5-fold out-of-fold CV on training (exact / family, of 407). Baseline is 254 / 294.
  - Trap ×1.5–3: 253 / 294.
  - R&B ×1.5–2: 248–250 / 287–290.
  - Trap ×2 with G-Walk ×2: 254 / 296, the best variant.
  - Trap recall never moved (9/15).
- Holdout for the CV-best variant (Trap ×2, G-Walk ×2):
  - Full refit: 101 / 109 / 88. But that refit also re-chose melWeight, 0.6 → 0.5.
  - Class weights alone at melWeight 0.6: family 99, exact 84 (−1).
  - Baseline at melWeight 0.5: 101 / 88. So the whole gain is the mel weight, not the class weights.
- Dropped: class weights don't help.
- melWeight 0.5 is not adopted. The original training CV picks 0.6, and switching now would be a choice made on the holdout.
