# (1.20, premium) The river's hippo, made to read like a game's star creature: a barrel of a body low in the water and
# the huge head that shows: a wide rounded muzzle with cheek bulges, sleepy eyes with heavy lids on turrets on top,
# small round ears (pink inside) that flick, nostril mounds with dark slits; purple-grey on top fading to pink
# round the mouth, wet and glossy. Its yawn: a pink mouth, a tongue, two big curved tusks, small teeth.
# Parts: 'body', 'jaw' (origin on the hinge; it opens by turning about x), 'earL' and 'earR' (each about its root).
# Head toward Blender -y (three's +z: it faces you as you come down the river). The waterline is z = 0.
# usage: Blender -b -P art/blender/hippo.py -- img/models/hippo.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, skin_body, apply, prim, join, pivot, export, bake_set, high_copy, eye, gradient, palettize

reset()
skin = material('hippo_skin', '#7a6b8c', rough=0.32)
gradient(skin, '#6a5c80', '#e3a2ad', 0.12, 0.72)
lidm = material('hippo_lid', '#75668a', rough=0.36)
pink = material('hippo_pink', '#f0a5b0', rough=0.4)
mouth = material('hippo_mouth', '#e57f8e', rough=0.38)
gum = material('hippo_gum', '#f3b2bb', rough=0.4)
tooth = material('hippo_tooth', '#fbf4e2', rough=0.22)
dark = material('hippo_dark', '#2a1f2c', rough=0.3)

# the body and the head (x across, y along: the head toward -y, z up); the muzzle's cheeks as side branches
P = [
    (0, 1.25, -0.1, 0.6, 0.52), (0, 0.8, 0.0, 0.92, 0.7), (0, 0.25, 0.04, 1.0, 0.74), (0, -0.25, 0.08, 0.9, 0.68),
    (0, -0.62, 0.24, 0.66, 0.52), (0, -0.95, 0.36, 0.6, 0.44), (0, -1.3, 0.34, 0.6, 0.36), (0, -1.62, 0.33, 0.56, 0.31),
    (0, -1.78, 0.32, 0.44, 0.24),
]
edges = [(i, i + 1) for i in range(len(P) - 1)]
for s in (1, -1):
    b = len(P)
    P += [(s * 0.34, -1.4, 0.26, 0.4, 0.33), (s * 0.4, -1.62, 0.24, 0.32, 0.26)]
    edges += [(6, b), (b, b + 1)]
body = apply(skin_body('body', P, edges, smooth=2), tris=4600)
body.data.materials.append(skin)

# the lower jaw: wide and deep, the chin rounded
J = [(0, -0.92, 0.06, 0.55, 0.2), (0, -1.28, 0.05, 0.66, 0.2), (0, -1.6, 0.07, 0.62, 0.17), (0, -1.78, 0.1, 0.48, 0.13)]
jaw = apply(skin_body('jaw', J, [(0, 1), (1, 2), (2, 3)], smooth=2), tris=1300)
jaw.data.materials.append(skin)

# the ears: small round, pink inside
ears = []
for s, nm in ((1, 'earL'), (-1, 'earR')):
    e = prim('sphere', nm, loc=(s * 0.4, -0.58, 0.86), scale=(0.08, 0.05, 0.12), rot=(0.35, 0, s * 0.35), mat=lidm, segments=14, ring_count=8)
    ears.append(e)

# the skin baked into one texture set (purple-grey over pink, soft shadow in the folds); the wrinkles and pores in the
# normal map from finer copies
highs = [high_copy(body, 1, {'kind': 'CLOUDS', 'scale': 0.07, 'strength': 0.02}), high_copy(jaw, 1, {'kind': 'CLOUDS', 'scale': 0.06, 'strength': 0.016}), None, None]
bake_set([body, jaw] + ears, 'hippo', size=1024, highs=highs, ao_dist=0.3, ao_k=0.5)

det = []
earin = {}
for s in (1, -1):
    # eye turrets on top, sleepy eyes looking ahead, a heavy upper lid
    det.append(prim('sphere', 'turret', loc=(s * 0.3, -0.86, 0.66), scale=(0.17, 0.15, 0.13), mat=lidm, segments=16, ring_count=10))
    det += eye(f'eye{s}', (s * 0.31, -0.95, 0.75), 0.085, (s * 0.25, -1.0, 0.3), iris='#5a3418', pupil='round', lid=0.5, lid_mat=lidm, low_lid=0.15, iris_k=0.7)
    # nostril mounds on top of the muzzle's front, dark slits
    det.append(prim('sphere', 'nosebump', loc=(s * 0.21, -1.6, 0.6), scale=(0.13, 0.11, 0.08), mat=lidm, segments=14, ring_count=8))
    det.append(prim('sphere', 'nostril', loc=(s * 0.22, -1.64, 0.665), scale=(0.055, 0.025, 0.018), rot=(0, 0, s * 0.5), mat=dark, segments=10, ring_count=6))
    # the ear's pink inside
    earin[s] = prim('sphere', 'earin', loc=(s * 0.4, -0.615, 0.86), scale=(0.045, 0.02, 0.08), rot=(0.35, 0, s * 0.35), mat=pink, segments=10, ring_count=6)
# the upper jaw's inside: a pink roof and small teeth along its front
roof = prim('sphere', 'roof', loc=(0, -1.35, 0.17), scale=(0.5, 0.42, 0.05), mat=mouth, segments=18, ring_count=8)
up_teeth = []
for s in (1, -1):
    for k in (0.1, 0.22):
        up_teeth.append(prim('cone', 'uptooth', loc=(s * k, -1.72, 0.15), scale=(0.03, 0.03, 0.07), rot=(math.pi - 0.3, 0, 0), mat=tooth, vertices=8, radius1=1, depth=1))
# the lower jaw's inside: gums, the tongue, two big curved tusks at its corners, small teeth at the front
jd = [prim('sphere', 'gums', loc=(0, -1.3, 0.2), scale=(0.52, 0.42, 0.06), mat=gum, segments=18, ring_count=8),
      prim('sphere', 'tongue', loc=(0, -1.2, 0.22), scale=(0.32, 0.3, 0.07), mat=mouth, segments=16, ring_count=8)]
for s in (1, -1):
    # (a tusk: a curved horn, three pieces bending up and in)
    for i, (dz, r, lean) in enumerate(((0.0, 0.065, 0.1), (0.13, 0.055, 0.3), (0.24, 0.04, 0.55))):
        jd.append(prim('cone', 'tusk', loc=(s * (0.44 - i * 0.025), -1.55 - i * 0.03, 0.3 + dz), scale=(r, r, 0.08), rot=(lean * 0.6, 0, -s * lean * 0.5), mat=tooth, vertices=10, radius1=1, radius2=0.72, depth=2))
    for k in (0.1, 0.22):
        jd.append(prim('cone', 'tooth', loc=(s * k, -1.76, 0.24), scale=(0.035, 0.035, 0.08), rot=(0.35, 0, 0), mat=tooth, vertices=8, radius1=1, depth=1))

# (all the small parts' colours in one palette: two draw calls a part on the phone)
palettize(det + [roof] + up_teeth + jd + list(earin.values()), 'hippo', rough=0.32)
body = join([body] + det + [roof] + up_teeth, 'body')
jaw = join([jaw] + jd, 'jaw')
pivot(jaw, (0, -0.86, 0.14))
for i, (e, s) in enumerate(zip(ears, (1, -1))):
    nm = e.name
    e = join([e, earin[s]], nm)
    pivot(e, (s * 0.38, -0.56, 0.78))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'hippo.glb')))
