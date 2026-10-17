# Prompt 2: merge Shima's INFLUENCE / ANTI maps (analyze-patch.ts) into data/atlas_graph.json.
# Only adds links between shelves we have; never removes Musicmap links. BRANCH is not ported (Musicmap families cover it).
import json, sys
M = {'house':'house','tech-house':'techhouse','deep-house':'deephouse','techno':'peaktechno','trance':'trance','drum-and-bass':'dnb',
 'dubstep':'dubstep','phonk':'phonk','ambient':'ambient','synthwave':'synthwave','trap':'trap','drill':'drill','boom-bap':'hiphop',
 'lofi-hip-hop':'lofi','pop':'pop','hyperpop':'hyperpop','rnb':'rnb','indie-rock':'indie','punk':'punk','metal':'metal',
 'singer-songwriter':'songwriter','folk':'folk','country':'country','jazz':'jazz','afrobeats':'afrobeats','amapiano':'amapiano',
 'reggaeton':'reggaeton','latin-pop':'latinpop','future-bass':'futurebass','hardstyle':'hardstyle','uk-garage':'ukgarage',
 'dance-pop':'dancepop','indie-pop':'indiepop','alternative-rock':'altrock','shoegaze':'shoegaze','cinematic':'cinematic','dancehall':'dancehall'}
R = json.load(open(sys.argv[1])); gp = 'data/atlas_graph.json'; g = json.load(open(gp)); P = g['profiles']
added = {'influence': 0, 'anti': 0}; skipped = set(); conflicts = []
for kind in ('influence', 'anti'):
    for a, bs in R[kind].items():
        A = M.get(a)
        if A not in P: skipped.add(a); continue
        for b in bs:
            B = M.get(b)
            if B not in P or B == A: skipped.add(b); continue
            pa = P[A]
            if kind == 'anti' and (B in pa['siblings'] or B in pa['parent'] or A in P[B]['siblings']): conflicts.append((A, B)); continue
            lst = pa.setdefault(kind, [])
            if B not in lst: lst.append(B); added[kind] += 1
g['relSources'] = g.get('relSources', []) + ["Shima analyze-patch.ts INFLUENCE/ANTI (hand-set, merged as extra links)"]
json.dump(g, open(gp, 'w'), indent=1)
print('added', added, 'skipped', sorted(skipped), 'anti-vs-sibling conflicts dropped', conflicts)
