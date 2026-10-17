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

## B. Second stage for Techno vs House (DROPPED)
Runs only when the top 2 shelves are Peak Time Techno plus a House-family shelf. Script: `calibration/v2/exp_techno_house.py`.

**Training, 5-fold out-of-fold** (62 such cases; the current model gets 39 right):

| Variant | Correct (of 62) |
|---|---|
| Her rule as written (Techno if bright < 0.35, vocalMid < 0.4, fourFloor > 0.8; House if bright > 0.5 or vocalMid > 0.5) | 33 |
| Thresholds chosen by nested CV | 32 |
| Tiny logistic second stage, nested CV | 38 |
| Best thresholds on all of training (Techno if bright < 0.3 and vocalMid < 0.3; House if vocalMid > 0.7) | 39, a tie with no stage |

**Holdout** (fires on 19 tracks; no stage = 99 / 85):

| Variant | Family | Exact | Techno |
|---|---|---|---|
| Her rule | 96 | 82 | 8 → 5 |
| All-training best | 100 | 86 | 9 |

The all-training-best rule doesn't regress the four protected shelves on the holdout.

**Dropped:**
- The +1 is one track, and on training this rule only ties the model.
- Nested CV shows threshold tuning loses on unseen data (32 vs 39).
- The feature set can't separate this pair; more Techno labels are needed (Priority 1).
