# (1.20, premium) Blouaap (Stapel's monkey: a vervet, "blouaap") paddling a block across the river, made to read like a
# game's star character: a big head with a black heart-shaped face, a white brow band and white cheek ruffs, big amber
# eyes with sparkles, a cheeky grin with little teeth, dark ears; silver-olive fur over a pale belly, dark hands and
# feet; a long tail curling up behind; a blue bandana with white dots (he's Blouaap); a paddle with a painted blade.
# Parts: 'body', 'head' (origin on the neck: it turns and tilts), 'arms' (the arms and the paddle; origin on the chest:
# they rock with each stroke). Faces Blender -y (three's +z: you). Sits on z = 0 (the block's top). ~1.2 m tall.
# usage: Blender -b -P art/blender/monkey.py -- img/models/monkey.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, skin_body, apply, prim, join, pivot, export, bake_set, high_copy, eye, gradient, detail, palettize

reset()
fur = material('mk_fur', '#7a5636', rough=0.8)
gradient(fur, '#6b4a2e', '#9a7250', 0.2, 1.1)
pale = material('mk_pale', '#e9c79c', rough=0.75)
furPlain = material('mk_furplain', '#6e4c2f', rough=0.8)   # (for the small parts: a plain colour exports as it is)
face = material('mk_face', '#efcfa3', rough=0.5)
hand = material('mk_hand', '#d9b088', rough=0.6)
black = material('mk_black', '#0e0c0b', rough=0.25)
pinkm = material('mk_mouth', '#b85a5e', rough=0.4)
tooth = material('mk_tooth', '#fbf6e8', rough=0.2)
band = material('mk_bandana', '#2563d8', rough=0.5)
dot = material('mk_dot', '#ffffff', rough=0.5)
wood = material('mk_wood', '#b07a42', rough=0.55)
paint = material('mk_paint', '#ffc21a', rough=0.4)

# --- the body sitting: pelvis, belly, chest, neck; thighs up, the feet flat; the tail curling up behind
P = [(0, 0.03, 0.22, 0.25, 0.22), (0, 0.0, 0.42, 0.24, 0.2), (0, -0.02, 0.6, 0.2, 0.17), (0, -0.03, 0.74, 0.1, 0.09)]
edges = [(0, 1), (1, 2), (2, 3)]
for s in (1, -1):
    b = len(P)
    P += [(s * 0.16, -0.06, 0.2, 0.11, 0.1), (s * 0.2, -0.32, 0.32, 0.09, 0.085), (s * 0.2, -0.42, 0.08, 0.065, 0.06)]
    edges += [(0, b), (b, b + 1), (b + 1, b + 2)]
b = len(P)
tail = [(0, 0.24, 0.14, 0.055, 0.055), (0, 0.5, 0.1, 0.05, 0.05), (0, 0.72, 0.26, 0.045, 0.045), (0, 0.72, 0.55, 0.04, 0.04), (0, 0.55, 0.68, 0.035, 0.035), (0, 0.42, 0.58, 0.03, 0.03)]
P += tail
edges += [(0, b)] + [(b + i, b + i + 1) for i in range(len(tail) - 1)]
body = apply(skin_body('body', P, edges, smooth=2), tris=3000)
body.data.materials.append(fur)
body.data.materials.append(pale)
feet = [prim('sphere', 'belly', loc=(0, -0.17, 0.46), scale=(0.135, 0.07, 0.17), mat=pale, segments=16, ring_count=10)]
for s in (1, -1):
    feet.append(prim('sphere', 'foot', loc=(s * 0.2, -0.48, 0.06), scale=(0.075, 0.11, 0.045), mat=hand, segments=12, ring_count=8))

# --- the head: a big round skull of fur, the black face, the ruffs, the muzzle
skull = apply(skin_body('skull', [(0, -0.02, 1.0, 0.27, 0.26), (0, 0.04, 1.06, 0.25, 0.24)], [(0, 1)], smooth=2), tris=1400)
skull.data.materials.append(fur)

# --- the arms (shoulders to the hands on the paddle's shaft)
arms_pts = []
arm_edges = []
for s in (1, -1):
    b = len(arms_pts)
    arms_pts += [(s * 0.21, -0.03, 0.64, 0.07, 0.065), (s * 0.3, -0.24, 0.5, 0.06, 0.055), (s * 0.17, -0.42, 0.54, 0.05, 0.045)]
    arm_edges += [(b, b + 1), (b + 1, b + 2)]
arms = apply(skin_body('arms', arms_pts, arm_edges, smooth=2), tris=900)
arms.data.materials.append(fur)

# the fur baked (silver-olive over pale, soft shadows); fine fur in the normal map
highs = [high_copy(o, 1, {'kind': 'STUCCI', 'scale': 0.008, 'strength': 0.01}) for o in (body, skull, arms)]
bake_set([body, skull, arms], 'monkey', size=1024, highs=highs, ao_dist=0.12, ao_k=0.5)

H = []
# the face: a tan heart shape (two lobes round the eyes, the muzzle under), the ears with tan insides
for s in (1, -1):
    H.append(prim('sphere', 'facelobe', loc=(s * 0.085, -0.19, 1.02), scale=(0.135, 0.09, 0.14), mat=face, segments=18, ring_count=10))
    H.append(prim('sphere', 'ear', loc=(s * 0.27, 0.0, 1.04), scale=(0.04, 0.09, 0.1), mat=furPlain, segments=12, ring_count=8))
    H.append(prim('sphere', 'earin', loc=(s * 0.282, -0.01, 1.04), scale=(0.03, 0.068, 0.075), mat=face, segments=10, ring_count=6))
    H += eye(f'eye{s}', (s * 0.088, -0.255, 1.035), 0.06, (s * 0.1, -1.0, 0.04), iris='#3d2412', pupil='round', lid=0.08, lid_mat=furPlain, iris_k=0.78)
    H.append(prim('sphere', 'brow', loc=(s * 0.09, -0.27, 1.11), scale=(0.055, 0.02, 0.016), rot=(0, s * 0.3, 0), mat=furPlain, segments=10, ring_count=6))
H.append(prim('sphere', 'muzzle', loc=(0, -0.27, 0.9), scale=(0.12, 0.1, 0.09), mat=face, segments=16, ring_count=10))
H.append(prim('sphere', 'nose', loc=(0, -0.365, 0.94), scale=(0.032, 0.02, 0.02), mat=black, segments=10, ring_count=6))
# the cheeky smile: a curved dark mouth, open a little, a pink tongue in it
H.append(prim('torus', 'smile', loc=(0, -0.352, 0.885), scale=(0.055, 0.03, 0.045), rot=(math.pi / 2, 0, 0), mat=black, major_radius=1, minor_radius=0.22, major_segments=16, minor_segments=5))
H.append(prim('sphere', 'mouth', loc=(0, -0.35, 0.865), scale=(0.045, 0.02, 0.022), mat=pinkm, segments=12, ring_count=6))
# the bandana: a band round the head with white dots, a knot and two tails behind
H.append(prim('torus', 'bandana', loc=(0, 0.02, 1.15), scale=(0.27, 0.27, 0.27), rot=(-0.28, 0, 0), mat=band, major_radius=1, minor_radius=0.18, major_segments=28, minor_segments=8))
# (the dots on the band's outer face: points on its ring, turned with it)
TILT = -0.28
R_DOT = 0.27 + 0.044
for k in range(14):
    a = k / 14 * math.pi * 2
    x = math.sin(a) * R_DOT
    y = -math.cos(a) * R_DOT
    H.append(prim('sphere', 'dot', loc=(x, 0.02 + y * math.cos(TILT), 1.15 + y * math.sin(TILT)), scale=(0.016, 0.016, 0.016), mat=dot, segments=8, ring_count=5))
# the knot at the back, and its two tails hanging down and back from it
H.append(prim('sphere', 'knot', loc=(0, 0.28, 1.08), scale=(0.06, 0.05, 0.05), mat=band, segments=12, ring_count=6))
for s in (1, -1):
    H.append(prim('cone', 'bandtail', loc=(s * 0.045, 0.33, 1.03), scale=(0.045, 0.018, 0.075), rot=(-2.3, s * 0.3, 0), mat=band, vertices=10, radius1=1, radius2=0.25, depth=2))

AP = []
for s in (1, -1):
    AP.append(prim('sphere', 'hand', loc=(s * 0.15, -0.44, 0.54), scale=(0.055, 0.05, 0.05), mat=hand, segments=12, ring_count=8))
AP.append(prim('cyl', 'shaft', loc=(0, -0.45, 0.54), scale=(0.026, 0.026, 0.8), rot=(0, math.pi / 2, 0), mat=wood, vertices=12))
for s in (1, -1):
    AP.append(prim('sphere', 'blade', loc=(s * 0.82, -0.45, 0.54), scale=(0.035, 0.11, 0.19), mat=wood, segments=14, ring_count=8))
    AP.append(prim('sphere', 'bladepaint', loc=(s * 0.82, -0.45, 0.54), scale=(0.037, 0.075, 0.12), mat=paint, segments=12, ring_count=6))

# (all the small parts' colours in one palette: two draw calls a part on the phone)
palettize(feet + H + AP, 'monkey', rough=0.5)
body = join([body] + feet, 'body')
head = join([skull] + H, 'head')
pivot(head, (0, -0.03, 0.8))
arms = join([arms] + AP, 'arms')
pivot(arms, (0, -0.04, 0.6))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'monkey.glb')))
