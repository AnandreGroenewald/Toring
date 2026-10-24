# (1.20) The river's crocodile (Nile crocodile, the Blyde's own): long flat body, scaly bumps, a row of scutes down the
# back, yellow eyes on top of the head, teeth along both jaws. Parts: 'body' and 'jaw' (the lower jaw, its origin on the
# hinge: the game opens and snaps it). Length ~3.4 m along +x (snout first), lying on the water (y = 0 the waterline).
# usage: Blender -b -P art/blender/croc.py -- img/models/croc.glb
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, skin_body, apply, prim, join, pivot, export

reset()
skin = material('croc_skin', '#5b7a3a', rough=0.55)
belly = material('croc_belly', '#b4ad83', rough=0.7)
scute = material('croc_scute', '#34431f', rough=0.5)
eye = material('croc_eye', '#d8c23a', rough=0.25, emit='#8a7a10', emit_k=0.6)
pupil = material('croc_pupil', '#0d0d0d', rough=0.2)
tooth = material('croc_tooth', '#efe6d0', rough=0.35)
mouth = material('croc_mouth', '#c07a6e', rough=0.5)

# the body's skeleton: snout to tail tip, and four legs (x along, y across, z up; radii (across, up))
P = [
    (1.62, 0, 0.14, 0.075, 0.04), (1.4, 0, 0.15, 0.11, 0.05), (1.12, 0, 0.17, 0.15, 0.06), (0.86, 0, 0.2, 0.2, 0.09),
    (0.6, 0, 0.2, 0.26, 0.1), (0.3, 0, 0.2, 0.36, 0.12), (0.0, 0, 0.2, 0.39, 0.125), (-0.32, 0, 0.19, 0.35, 0.12),
    (-0.6, 0, 0.18, 0.27, 0.11), (-0.95, 0, 0.17, 0.18, 0.095), (-1.3, 0, 0.16, 0.12, 0.08), (-1.62, 0, 0.15, 0.08, 0.06),
    (-1.9, 0, 0.14, 0.045, 0.04), (-2.08, 0, 0.14, 0.015, 0.015),
]
edges = [(i, i + 1) for i in range(len(P) - 1)]
for (hx, hi), side in [((0.32, 5), 1), ((0.32, 5), -1), ((-0.55, 8), 1), ((-0.55, 8), -1)]:
    base = len(P)
    # (short legs sprawled out to the side, the feet flat and splayed)
    P += [(hx + 0.02, side * 0.34, 0.15, 0.065, 0.055), (hx + 0.08, side * 0.5, 0.1, 0.048, 0.042), (hx + 0.16, side * 0.6, 0.06, 0.07, 0.022)]
    edges += [(hi, base), (base, base + 1), (base + 1, base + 2)]
body = apply(skin_body('body', P, edges, smooth=1, displace={'kind': 'VORONOI', 'scale': 0.06, 'strength': 0.018}), tris=4200)
body.data.materials.append(skin)
body.data.materials.append(belly)
for p in body.data.polygons:
    p.material_index = 1 if p.normal.z < -0.35 else 0

parts = [body]
# eyes on top of the head: a bump, the eye, a slit
for s in (1, -1):
    parts.append(prim('sphere', 'brow', loc=(0.84, s * 0.12, 0.29), scale=(0.07, 0.06, 0.05), mat=skin, segments=12, ring_count=6))
    parts.append(prim('sphere', 'eye', loc=(0.87, s * 0.125, 0.31), scale=(0.045, 0.04, 0.035), mat=eye, segments=12, ring_count=6))
    parts.append(prim('sphere', 'pupil', loc=(0.905, s * 0.127, 0.315), scale=(0.008, 0.012, 0.03), mat=pupil, segments=8, ring_count=6))
    parts.append(prim('sphere', 'nostril', loc=(1.58, s * 0.03, 0.2), scale=(0.025, 0.02, 0.02), mat=skin, segments=8, ring_count=6))
# scutes down the back: two rows, one on the tail, getting smaller
x = 0.5
while x > -1.9:
    rows = (1, -1) if x > -0.7 else (0,)
    h = 0.055 * (1 - max(0, -x - 0.2) / 2.2) + 0.015
    zt = 0.22 + 0.15 * max(0.0, 1 - abs(x) / 1.4) * 0.6 + (0.02 if x > -0.7 else 0)
    for s in rows:
        parts.append(prim('cone', 'scute', loc=(x, s * 0.09, zt + 0.05), scale=(0.05, 0.035, h), mat=scute, vertices=6, radius1=1, depth=1))
    x -= 0.13
# teeth along the upper jaw (pointing down)
x = 0.98
while x < 1.56:
    w = 0.12 - (x - 0.98) * 0.09
    for s in (1, -1):
        parts.append(prim('cone', 'tooth', loc=(x, s * w, 0.085), scale=(0.014, 0.014, 0.045), rot=(3.14159, 0, 0), mat=tooth, vertices=6, radius1=1, depth=1))
    x += 0.075
body = join(parts, 'body')

# the lower jaw: its own part, hinged under the eyes
J = [(0.74, 0, 0.1, 0.17, 0.06), (1.05, 0, 0.08, 0.13, 0.045), (1.35, 0, 0.075, 0.1, 0.035), (1.6, 0, 0.08, 0.065, 0.03)]
jaw = apply(skin_body('jaw', J, [(0, 1), (1, 2), (2, 3)], smooth=2), tris=700)
jaw.data.materials.append(skin)
jaw.data.materials.append(belly)
for p in jaw.data.polygons:
    p.material_index = 1 if p.normal.z < -0.3 else 0
jparts = [jaw, prim('sphere', 'tongue', loc=(1.05, 0, 0.115), scale=(0.3, 0.09, 0.02), mat=mouth, segments=12, ring_count=6)]
x = 1.0
while x < 1.56:
    w = 0.1 - (x - 1.0) * 0.08
    for s in (1, -1):
        jparts.append(prim('cone', 'tooth', loc=(x + 0.035, s * w, 0.125), scale=(0.012, 0.012, 0.04), mat=tooth, vertices=6, radius1=1, depth=1))
    x += 0.075
jaw = join(jparts, 'jaw')
pivot(jaw, (0.74, 0, 0.11))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'croc.glb')))
