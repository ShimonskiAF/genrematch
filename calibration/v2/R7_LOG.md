# Round 7 retrain (branch r7, off r6 84373aa). Not pushed.

**Data:** 59 new tracks (Shima's Round 7 list), root `r7`, all used for training:

| Neo-Soul | Alt R&B | Deep House | Country | Peak Time Techno | Phonk |
|---|---|---|---|---|---|
| 12 | 10 | 10 | 10 | 11 | 6 |

- Neo-Soul is 10 from the list plus 2 re-downloads (Jill Scott, A Long Walk; Lauryn Hill, Ex-Factor). Peak Time Techno is 8 plus 3 re-downloads (Regal, Still Raving; Len Faki, Rainbow Delta; Reinier Zonneveld, Move Your Body).
- On the Mac, the folder `Neo Soul ` (with a trailing space) was normalised to `Neo-Soul`.
- Every file is a valid mp3 (ffprobe), from 2:13 to 13:38 long.
- No file matches an earlier round by md5 (715 files checked) or by normalised filename.
- Key Glock, Ambition For Cash (Trap) was not re-downloaded. The Mac Trap folder still has only `fix_prompt_3.md`. It stays excluded (`uploads/r6_excluded/`).

**Holdouts:** unchanged. The frozen v1 126 tracks and the r6 25 tracks are never trained on. Training now has 522 tracks (463 + 59).

**Pipeline:**
- `tools/extract_one.js` (v1), `extract_v2.js`, `mel_extract.js` and `groove_extract.js` on r7 paths only. `tools/fof_extract_paths.js` is a subset version of `fof_extract.js`.
- Merged into features.json, features_v2.json, yamnet_emb.json.gz, fof_b.json and groove_tracks.json.
- Then calibrate.js --write, apply_groove.js, export.js, fit_v2.py, fit_fb.py + merge_fb.js, and bench.js --write-ood.

**CV on training (5-fold, fused):**
- melWeight 0.5 wins: famSum 0.762, NLL 1.135. For comparison, 0.6 gives 0.759 and 0.7 gives 0.761. r6 used 0.7 at 0.741.
- Fallback head CV famSum 0.705.
- A C/shrinkage grid for the fallback head (3×5-fold, training only) gave a spread of at most about 1.5 pp, which is noise. The recipe is kept at C 0.3 and shrinkage 0.3.

**Old 126 holdout (family / super / exact):**

| Path | master 7ab37f0 (live) | r6 | r7 |
|---|---|---|---|
| With mel | 99 / 108 / 85 | 100 / 109 / 83 | **103 / 111 / 87** |
| Fallback | 92 / 102 / 80 | 91 / 101 / 77 | 93 / 104 / **75** |

- With mel, against live: 6 tracks become right on family and 2 become wrong. McNemar against the old live v1 is 23.6.
- Fallback exact loses 9 tracks and gains 4. Three of the losses are R&B Soul tracks that now read Neo-Soul or Alt R&B: Alicia Keys, Fallin'; Daniel Caesar, Best Part; Summer Walker, Girls Need Love. Master has no such shelves, so it could not make that call.

**r6 holdout (25 tracks):**

| Path | master | r6 | r7 |
|---|---|---|---|
| With mel | 16 / 17 / 6 | 18 / 19 / 12 | **22 / 23 / 17** |
| Fallback | 16 / 17 / 5 | 24 / 24 / 14 | 23 / 23 / 16 |

**Per shelf, v1 + r6 holdouts, with mel (family / exact / n):**
- Peak Time Techno: 12/12/19, the same as live. Techno read as House is still 7 tracks: 4 as Bass House, 3 as Tech House.
- Neo-Soul 2/2/2 (live 2/0). Alt R&B 3/0/3: all 3 read as contemporary R&B. Contemporary R&B 15/13/18 (live 14/14).
- Phonk 7/6/9 (live 4/4). Country 2/2/2. Deep House 1/1/2 (live 1/0).

**CV per shelf (training, exact/n):**
- Peak Time Techno 46/66: 8 confused with Tech House, 5 with Bass House.
- Neo-Soul 14/18. Alt R&B 9/17: 6 confused with R&B. R&B 36/54: 6 confused with Alt R&B.
- Phonk 29/33. Country 12/14. Deep House 8/14: 3 confused with Tech House. Soul 4/7: 3 confused with Country.
