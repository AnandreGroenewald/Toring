# (1.20) Blouaap (Stapel's monkey) paddling a block across the river: a vervet-ish monkey sitting with its knees up,
# brown-grey fur, a tan face with bright eyes, a blue bandana (he's Blouaap), a curled tail, holding a paddle.
# Parts: 'body', 'head' (origin on the neck: it turns and tilts), 'arms' (the arms and the paddle; origin on the chest:
# they rock with each stroke). Faces Blender -y (three's +z: you). Sits on z = 0 (the block's top). ~1.15 m tall.
# usage: Blender -b -P art/blender/monkey.py -- img/models/monkey.glb
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, skin_body, apply, prim, join, pivot, export

reset()
fur = material('mk_fur', '#7d6a52', rough=0.85)
furDark = material('mk_furdark', '#4f4233', rough=0.85)
face = material('mk_face', '#dbb48b', rough=0.6)
white = material('mk_white', '#f6f1e8', rough=0.3)
black = material('mk_black', '#151210', rough=0.25)
band = material('mk_bandana', '#2f6fd6', rough=0.55)
wood = material('mk_wood', '#a8743d', rough=0.6)

# the body sitting: pelvis, chest, neck; thighs up, feet flat; the tail curling up behind
P = [(0, 0.02, 0.24, 0.27, 0.24), (0, -0.01, 0.52, 0.24, 0.2), (0, -0.03, 0.74, 0.1, 0.09)]
edges = [(0, 1), (1, 2)]
for s in (1, -1):
    b = len(P)
    P += [(s * 0.17, -0.06, 0.2, 0.1, 0.09), (s * 0.21, -0.34, 0.3, 0.085, 0.08), (s * 0.2, -0.44, 0.06, 0.06, 0.05), (s * 0.2, -0.56, 0.03, 0.05, 0.03)]
    edges += [(0, b), (b, b + 1), (b + 1, b + 2), (b + 2, b + 3)]
b = len(P)
P += [(0, 0.24, 0.16, 0.06, 0.06), (0, 0.48, 0.12, 0.05, 0.05), (0, 0.66, 0.3, 0.04, 0.04), (0, 0.6, 0.55, 0.035, 0.035), (0, 0.45, 0.6, 0.025, 0.025)]
edges += [(0, b), (b, b + 1), (b + 1, b + 2), (b + 2, b + 3), (b + 3, b + 4)]
body = apply(skin_body('body', P, edges, smooth=2, displace={'kind': 'CLOUDS', 'scale': 0.04, 'strength': 0.012}), tris=2600)
body.data.materials.append(fur)
body.data.materials.append(face)
for p in body.data.polygons:
    c = p.center
    # (a lighter belly and chest in front)
    p.material_index = 1 if (c.y < -0.12 and 0.2 < c.z < 0.62 and abs(c.x) < 0.16) else 0
body = join([body, prim('sphere', 'tailtip', loc=(0, 0.42, 0.6), scale=(0.035, 0.035, 0.035), mat=furDark, segments=8, ring_count=6)], 'body')

# the head: round skull, a tan face mask and muzzle, big eyes, ears, the blue bandana knotted at the back
H = [prim('sphere', 'skull', loc=(0, -0.04, 1.0), scale=(0.25, 0.24, 0.24), mat=fur, segments=20, ring_count=12)]
H.append(prim('sphere', 'mask', loc=(0, -0.2, 0.97), scale=(0.2, 0.1, 0.17), mat=face, segments=18, ring_count=10))
H.append(prim('sphere', 'muzzle', loc=(0, -0.29, 0.9), scale=(0.11, 0.08, 0.08), mat=face, segments=14, ring_count=8))
H.append(prim('sphere', 'nose', loc=(0, -0.36, 0.93), scale=(0.035, 0.02, 0.022), mat=black, segments=8, ring_count=6))
H.append(prim('torus', 'smile', loc=(0, -0.345, 0.865), scale=(0.045, 0.02, 0.025), rot=(1.5708, 0, 0), mat=black, major_radius=1, minor_radius=0.25, major_segments=12, minor_segments=4))
for s in (1, -1):
    H.append(prim('sphere', 'eye', loc=(s * 0.085, -0.27, 1.03), scale=(0.055, 0.035, 0.06), mat=white, segments=12, ring_count=8))
    H.append(prim('sphere', 'pupil', loc=(s * 0.085, -0.3, 1.03), scale=(0.028, 0.012, 0.034), mat=black, segments=10, ring_count=6))
    H.append(prim('sphere', 'brow', loc=(s * 0.09, -0.24, 1.1), scale=(0.075, 0.035, 0.022), rot=(0, s * 0.25, 0), mat=furDark, segments=10, ring_count=6))
    H.append(prim('sphere', 'ear', loc=(s * 0.25, -0.02, 1.02), scale=(0.035, 0.09, 0.1), mat=face, segments=12, ring_count=8))
H.append(prim('torus', 'bandana', loc=(0, 0.0, 1.12), scale=(0.25, 0.25, 0.25), rot=(-0.3, 0, 0), mat=band, major_radius=1, minor_radius=0.2, major_segments=24, minor_segments=8))
H.append(prim('sphere', 'knot', loc=(0, 0.25, 1.08), scale=(0.06, 0.05, 0.05), mat=band, segments=10, ring_count=6))
for s in (1, -1):
    H.append(prim('cone', 'bandtail', loc=(s * 0.07, 0.33, 0.98), scale=(0.05, 0.02, 0.13), rot=(-0.6, s * 0.3, 0), mat=band, vertices=8, radius1=1, depth=1))
head = join(H, 'head')
pivot(head, (0, -0.03, 0.8))

# the arms and the paddle: shoulders to elbows to the hands on the shaft; a blade at each end
A = [(s * 0.22, -0.04, 0.62) for s in (1, -1)]
arms_pts = []
arm_edges = []
for s in (1, -1):
    b = len(arms_pts)
    arms_pts += [(s * 0.22, -0.04, 0.63, 0.065, 0.06), (s * 0.3, -0.26, 0.48, 0.055, 0.05), (s * 0.16, -0.42, 0.52, 0.05, 0.045)]
    arm_edges += [(b, b + 1), (b + 1, b + 2)]
arms = apply(skin_body('arms', arms_pts, arm_edges, smooth=1), tris=700)
arms.data.materials.append(fur)
AP = [arms]
for s in (1, -1):
    AP.append(prim('sphere', 'hand', loc=(s * 0.14, -0.44, 0.53), scale=(0.055, 0.05, 0.05), mat=face, segments=10, ring_count=6))
AP.append(prim('cyl', 'shaft', loc=(0, -0.45, 0.53), scale=(0.028, 0.028, 0.8), rot=(0, 1.5708, 0), mat=wood, vertices=10))
for s in (1, -1):
    AP.append(prim('cube', 'blade', loc=(s * 0.82, -0.45, 0.53), scale=(0.03, 0.1, 0.17), mat=wood))
arms = join(AP, 'arms')
pivot(arms, (0, -0.04, 0.6))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'monkey.glb')))
