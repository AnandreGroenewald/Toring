# (1.20, premium) The river's crocodile, made to read like a game's star creature: a chunky body and a big head, a
# broad rounded snout with nostril mounds on its tip, big glossy eyes with slit pupils under heavy lids (a sly look),
# chunky teeth in uneven rows, rounded plates in rows down the back that run into a double crest on the tail, a mossy
# back fading to a pale belly with dark bands across, wet and glossy (scales pressed into its normal map).
# Parts: 'body' (head with the upper jaw, the trunk, the legs), 'jaw' (the lower jaw, its origin on the hinge: the game
# opens and snaps it), 'tail1' and 'tail2' (the tail in two, each turning about its own root: the game swings them).
# Length ~3.6 m along +x (snout first), lying on the water (z = 0 the waterline, Blender axes; three's y).
# usage: Blender -b -P art/blender/croc.py -- img/models/croc.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, skin_body, apply, prim, join, pivot, export, bake_set, high_copy, eye, bands, gradient, palettize

reset()
skin = material('croc_skin', '#6f8f3a', rough=0.34)
gradient(skin, '#46652a', '#bcc472', 0.08, 0.33)
bands(skin, scale=2.3, mix=0.32, color2='#2a3d1b', axis='X', distort=1.2)
belly = material('croc_belly', '#e6dba6', rough=0.4)
plate = material('croc_plate', '#3d5824', rough=0.5)
tooth = material('croc_tooth', '#fbf6e6', rough=0.2)
mouth = material('croc_mouth', '#d77f79', rough=0.35)
dark = material('croc_dark', '#141a0e', rough=0.3)
lidm = material('croc_lid', '#3f5d24', rough=0.36)

# --- the trunk and the head (with the upper jaw): x along, y across, z up; radii (across, up)
P = [
    (1.76, 0, 0.17, 0.13, 0.06), (1.6, 0, 0.17, 0.17, 0.07), (1.38, 0, 0.18, 0.19, 0.075), (1.15, 0, 0.19, 0.22, 0.085),
    (0.95, 0, 0.21, 0.27, 0.11), (0.78, 0, 0.23, 0.31, 0.14), (0.6, 0, 0.22, 0.32, 0.15), (0.42, 0, 0.21, 0.36, 0.16),
    (0.2, 0, 0.21, 0.46, 0.19), (-0.06, 0, 0.21, 0.5, 0.2), (-0.32, 0, 0.2, 0.46, 0.19), (-0.58, 0, 0.19, 0.36, 0.17),
]
edges = [(i, i + 1) for i in range(len(P) - 1)]
for (hx, hi), side in [((0.24, 8), 1), ((0.24, 8), -1), ((-0.42, 10), 1), ((-0.42, 10), -1)]:
    base = len(P)
    # (short chunky legs sprawled to the side, the feet flat)
    P += [(hx + 0.02, side * 0.42, 0.15, 0.09, 0.075), (hx + 0.08, side * 0.6, 0.08, 0.07, 0.06), (hx + 0.16, side * 0.68, 0.035, 0.09, 0.03)]
    edges += [(hi, base), (base, base + 1), (base + 1, base + 2)]
body = apply(skin_body('body', P, edges, smooth=2), tris=5200)
body.data.materials.append(skin)
body.data.materials.append(belly)
for p in body.data.polygons:
    p.material_index = 1 if p.normal.z < -0.3 else 0

# --- the tail: two parts, each from its own root (they overlap the part before so the joint never opens)
T1 = [(-0.5, 0, 0.19, 0.34, 0.16), (-0.8, 0, 0.18, 0.27, 0.145), (-1.1, 0, 0.17, 0.2, 0.125), (-1.3, 0, 0.165, 0.16, 0.11)]
tail1 = apply(skin_body('tail1', T1, [(0, 1), (1, 2), (2, 3)], smooth=2), tris=1400)
T2 = [(-1.24, 0, 0.165, 0.165, 0.11), (-1.5, 0, 0.16, 0.12, 0.09), (-1.75, 0, 0.155, 0.075, 0.065), (-1.98, 0, 0.15, 0.025, 0.03)]
tail2 = apply(skin_body('tail2', T2, [(0, 1), (1, 2), (2, 3)], smooth=2), tris=1000)
for o in (tail1, tail2):
    o.data.materials.append(skin)
    o.data.materials.append(belly)
    for p in o.data.polygons:
        p.material_index = 1 if p.normal.z < -0.3 else 0

# --- the lower jaw: hinged under the eyes, a little narrower than the snout, the tongue and teeth inside
J = [(0.64, 0, 0.13, 0.27, 0.075), (0.9, 0, 0.11, 0.22, 0.06), (1.2, 0, 0.1, 0.18, 0.05), (1.48, 0, 0.1, 0.15, 0.045), (1.7, 0, 0.11, 0.11, 0.04)]
jaw = apply(skin_body('jaw', J, [(0, 1), (1, 2), (2, 3), (3, 4)], smooth=2), tris=1200)
jaw.data.materials.append(skin)
jaw.data.materials.append(belly)
for p in jaw.data.polygons:
    p.material_index = 1 if p.normal.z < -0.2 else 0

# the skin baked into one texture set (the mossy back over the pale belly, the bands, soft shadow in every fold); the
# scales pressed into the normal map from finer, bumpier copies
highs = [high_copy(o, 1, {'kind': 'VORONOI', 'scale': s, 'strength': k}) for o, s, k in ((body, 0.03, 0.016), (tail1, 0.026, 0.014), (tail2, 0.022, 0.012), (jaw, 0.022, 0.01))]
bake_set([body, tail1, tail2, jaw], 'croc', size=1024, highs=highs, ao_dist=0.25, ao_k=0.55)

# --- the details (their own crisp colours): eyes, brows, nostrils, plates, teeth
det = []
for s in (1, -1):
    # the eye on a mound on top of the head, looking forward and out, a heavy lid (a sly, half-shut look)
    det.append(prim('sphere', 'mound', loc=(0.8, s * 0.17, 0.31), scale=(0.12, 0.1, 0.085), mat=lidm, segments=16, ring_count=10))
    det += eye(f'eye{s}', (0.86, s * 0.175, 0.37), 0.068, (0.85, s * 0.42, 0.22), iris='#d6e23f', pupil='slit', lid=0.42, lid_mat=lidm, low_lid=0.18)
    det.append(prim('sphere', 'brow', loc=(0.8, s * 0.16, 0.43), scale=(0.085, 0.06, 0.028), rot=(s * 0.25, -0.3, 0), mat=lidm, segments=12, ring_count=6))
    # the nostrils: a mound on the snout's tip with a dark slit
    det.append(prim('sphere', 'nosebump', loc=(1.66, s * 0.055, 0.225), scale=(0.06, 0.05, 0.035), mat=lidm, segments=12, ring_count=8))
    det.append(prim('sphere', 'nostril', loc=(1.69, s * 0.058, 0.252), scale=(0.022, 0.012, 0.012), mat=dark, segments=8, ring_count=5))
# the plates down the back: four rows over the trunk, two over the tail (smaller towards its tip), a double crest
plates_body, plates_t1, plates_t2 = [], [], []
x = 0.5
while x > -2.0:
    if x > -0.5:
        rows, dest, zb = ((0.075, 0.2) if x < 0.35 else (0.07,)), plates_body, 0.2 + 0.19 * max(0.0, 1 - abs(x + 0.06) / 0.9)
    elif x > -1.27:
        rows, dest, zb = (0.07,), plates_t1, 0.18 + 0.15 * max(0.0, 1 - (-x - 0.5) / 0.9)
    else:
        rows, dest, zb = (0.04,), plates_t2, 0.16 + 0.1 * max(0.0, 1 - (-x - 1.27) / 0.8)
    k = max(0.35, 1 - max(0.0, -x - 0.3) / 2.0)
    for ry in rows:
        for s in (1, -1):
            dest.append(prim('sphere', 'plate', loc=(x, s * ry * (0.6 + 0.4 * k), zb + 0.008), scale=(0.058 * k, 0.045 * k, 0.024 * k), mat=plate, segments=8, ring_count=5))
            if x < -0.5:
                # (the tail's crest: little upright plates)
                dest.append(prim('cone', 'crest', loc=(x, s * ry * (0.6 + 0.4 * k), zb + 0.045 * k), scale=(0.035 * k, 0.012, 0.05 * k), mat=plate, vertices=4, radius1=1, depth=1))
    x -= 0.12
# teeth: chunky, uneven, the fourth from the tip bigger (the croc's grin), along both jaws
teeth_up, teeth_low = [], []
xs = [1.7, 1.6, 1.49, 1.37, 1.25, 1.13, 1.01, 0.9]
for i, x in enumerate(xs):
    w = 0.115 + (1.7 - x) * 0.11
    big = 1.45 if i == 3 else (0.8 if i % 2 else 1.0)
    for s in (1, -1):
        teeth_up.append(prim('cone', 'tooth', loc=(x, s * w, 0.115), scale=(0.022 * big, 0.022 * big, 0.05 * big), rot=(math.pi + s * 0.15, 0, 0), mat=tooth, vertices=6, radius1=1, depth=1))
for i, x in enumerate(xs[:-1]):
    xx = x - 0.055
    w = 0.1 + (1.7 - xx) * 0.1
    big = 1.3 if i == 0 else (0.8 if i % 2 else 1.0)
    for s in (1, -1):
        teeth_low.append(prim('cone', 'tooth', loc=(xx, s * w, 0.155), scale=(0.02 * big, 0.02 * big, 0.045 * big), rot=(-s * 0.15, 0, 0), mat=tooth, vertices=6, radius1=1, depth=1))
tongue = prim('sphere', 'tongue', loc=(1.0, 0, 0.13), scale=(0.42, 0.13, 0.025), mat=mouth, segments=16, ring_count=8)
roof = prim('sphere', 'roof', loc=(1.15, 0, 0.13), scale=(0.55, 0.16, 0.025), mat=mouth, segments=16, ring_count=8)

# (all the small parts' colours in one palette: two draw calls a part on the phone)
palettize(det + plates_body + teeth_up + [roof] + plates_t1 + plates_t2 + teeth_low + [tongue], 'croc', rough=0.3)
body = join([body] + det + plates_body + teeth_up + [roof], 'body')
tail1 = join([tail1] + plates_t1, 'tail1')
tail2 = join([tail2] + plates_t2, 'tail2')
jaw = join([jaw] + teeth_low + [tongue], 'jaw')
pivot(jaw, (0.64, 0, 0.14))
pivot(tail1, (-0.52, 0, 0.19))
pivot(tail2, (-1.26, 0, 0.165))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'croc.glb')))
