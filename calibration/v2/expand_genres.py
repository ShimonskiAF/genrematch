# Prompt 1 port: Shima's expanded genre list (genres.ts, her builder app) as PRIORS for GenreMatch shelves.
# Her targets live in her app's 0..1 space (energy, brightness, bass, air, rhythm, harmonic, pulse), not ours.
# Neighbours are only taken from the same super-genre (her family field).
# Rule: fitted shelves keep fitted values. Estimate/new shelves are placed RELATIVE to a neighbour we trust:
#   centre = neighbour centre + slope * (her target - her neighbour target), for the features whose meaning
#   transfers (same-name correlation over 11 shared fitted shelves >= 0.4: energy, brightness, pulse, rhythm->fourFloor).
#   Neighbour = nearest fitted shelf in her space if close (< TAU), else nearest existing estimate shelf.
# Output: calibration/v2/estimate_shelves.json (merged by calibrate.js/fit and by this script into data/genre_profiles.json).
import json, numpy as np, sys
H = json.load(open('calibration/v2/shima_genres.json'))
doc = json.load(open('data/genre_profiles.json')); P = {p['id']: p for p in doc['profiles']}
SLUG = {'house':'house','tech-house':'techhouse','deep-house':'deephouse','techno':'peaktechno','trance':'trance','future-bass':'futurebass','hardstyle':'hardstyle','uk-garage':'ukgarage','drum-and-bass':'dnb','dubstep':'dubstep','phonk':'phonk','ambient':'ambient','synthwave':'synthwave','trap':'trap','drill':'drill','boom-bap':'hiphop','lofi-hip-hop':'lofi','pop':'pop','dance-pop':'dancepop','indie-pop':'indiepop','hyperpop':'hyperpop','rnb':'rnb','indie-rock':'indie','alternative-rock':'altrock','punk':'punk','metal':'metal','shoegaze':'shoegaze','singer-songwriter':'songwriter','folk':'folk','country':'country','jazz':'jazz','cinematic':'cinematic','afrobeats':'afrobeats','amapiano':'amapiano','reggaeton':'reggaeton','dancehall':'dancehall','latin-pop':'latinpop'}
NEW = {  # id: (name, family on Musicmap/atlas, atlas ids)
 'futurebass': ('Future Bass', "Drum 'n' Bass", ['dnb10']), 'hardstyle': ('Hardstyle', 'Hardcore Techno', ['hct09']), 'ukgarage': ('UK Garage', 'Breakbeat', ['brb06', 'brb09']),
 'dancepop': ('Dance Pop', 'Pop', ['pop11']), 'indiepop': ('Indie Pop', 'Pop', ['pop08']), 'altrock': ('Alternative Rock', 'Alternative', ['alt07']), 'shoegaze': ('Shoegaze', 'Alternative', ['alt03']),
 'cinematic': ('Cinematic', 'Classical', ['cla']), 'dancehall': ('Dancehall', 'Jamaican', ['jam08', 'jam09'])}
TK = ['energy', 'brightness', 'bass', 'air', 'rhythm', 'harmonic', 'pulse']
MAP = {'energy': 'energy', 'brightness': 'brightness', 'pulse': 'pulse', 'rhythm': 'fourFloor'}
# Her prompt names the neighbour each shelf must differ from; those pairs override the distance rule.
PAIR = {'deep-house': 'house', 'future-bass': 'trance', 'drill': 'trap', 'hyperpop': 'pop', 'punk': 'indie-rock', 'dance-pop': 'pop', 'uk-garage': 'house', 'hardstyle': 'peak'}
PAIR.pop('hardstyle')
TAU = float(sys.argv[1]) if len(sys.argv) > 1 else 0.35
fitted = [s for s, i in SLUG.items() if i in P and 'calibrated' in P[i]['status']]
tv = lambda s: np.array([H[s]['targets'][k] for k in TK])
slope = {}
for t, o in MAP.items():
    x = np.array([H[s]['targets'][t] for s in fitted]); y = np.array([P[SLUG[s]]['features'][o] for s in fitted])
    r = np.corrcoef(x, y)[0, 1]; b = np.polyfit(x, y, 1)[0]
    slope[o] = round(float(np.clip(b, 0.2, 1.5)), 3); print(f'{t:>10} -> {o:<10} r={r:.2f} slope={b:.2f}')
r2 = lambda v: round(float(min(1, max(0, v))), 2)
out, log = [], []
for s, i in SLUG.items():
    if i in P and 'calibrated' in P[i]['status']: continue  # data wins
    same = lambda f: H[f]['family'] == H[s]['family']  # stay inside her super-genre: no rock shelf built on an Afrobeats neighbour
    d = sorted(((float(np.linalg.norm(tv(s) - tv(f))), f) for f in fitted if same(f))) or [(9.0, None)]
    if s in PAIR: base_slug, how = PAIR[s], 'named in her prompt'
    elif d[0][0] < TAU: base_slug, how = d[0][1], 'fitted neighbour'
    elif i in P: log.append((i, 'kept (no close fitted neighbour)', round(d[0][0], 2))); continue
    else:
        est = [e for e, j in SLUG.items() if j in P and 'calibrated' not in P[j]['status'] and same(e)] or [e for e, j in SLUG.items() if j in P and 'calibrated' not in P[j]['status']]
        base_slug, how = min(est, key=lambda e: np.linalg.norm(tv(s) - tv(e))), 'estimate neighbour'
    base = P[SLUG[base_slug]]['features']
    keep = ['bpm', 'energy', 'brightness', 'texture', 'bass', 'dynamics', 'pulse', 'fourFloor', 'tresillo', 'offbeat', 'syncop', 'backbeat']
    f = {k: base[k] for k in keep if k in base}
    for t, o in MAP.items(): f[o] = r2(base[o] + slope[o] * (H[s]['targets'][t] - H[base_slug]['targets'][t]))
    lo, hi = min(b[0] for b in H[s]['bpm']), max(b[1] for b in H[s]['bpm'])
    f['bpm'] = int(round((lo + hi) / 2)) if i not in P else P[i]['features']['bpm']
    f['bpmSpread'] = round(min(3, max(1, np.log2(hi / lo) / 0.3)), 2)
    if 'spread' in base: f['spread'] = {k: round(min(0.5, 1.5 * v), 2) for k, v in base['spread'].items() if k in keep}
    name, fam, at = NEW.get(i, (P.get(i, {}).get('name'), P.get(i, {}).get('family'), P.get(i, {}).get('atlas_ids')))
    out.append({'id': i, 'name': name, 'family': fam, 'atlas_ids': at, 'features': f, 'status': f'estimate, from Shima genre targets placed relative to {SLUG[base_slug]} ({how}); untested, no labelled audio', 'traits': H[s]['traits']})
    log.append((i, f'{how}: {SLUG[base_slug]}', round(d[0][0], 2)))
for l in log: print(l)
json.dump({'note': 'Estimate shelves placed from Shima\'s genres.ts targets (priors only). Fitted shelves are never touched. See expand_genres.py.', 'slopes': slope, 'tau': TAU, 'profiles': out}, open('calibration/v2/estimate_shelves.json', 'w'), indent=1)
