# (1.20) The river's hippo: a barrel of a body low in the water, the big wide head with eyes, ears and nostrils on top
# (all that shows of a hippo in a river), and a lower jaw on a hinge for its yawn: pink inside, two tusks, small teeth.
# Parts: 'body' and 'jaw' (origin on the hinge; it opens by turning about x). Head toward Blender -y (three's +z: it
# faces you as you come down the river). The waterline is z = 0. ~2.3 m wide, ~3.3 m long.
# usage: Blender -b -P art/blender/hippo.py -- img/models/hippo.glb
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, skin_body, apply, prim, join, pivot, export, detail, bake_set, high_copy

reset()
skin = material('hippo_skin', '#7c6c80', rough=0.45)
skinPlain = material('hippo_skin_plain', '#76667a', rough=0.45)
blush = material('hippo_blush', '#b58a8f', rough=0.5)
dark = material('hippo_dark', '#4d4152', rough=0.5)
mouth = material('hippo_mouth', '#d98c95', rough=0.45)
tooth = material('hippo_tooth', '#f1ead6', rough=0.35)
white = material('hippo_eyewhite', '#f4efe6', rough=0.3)
black = material('hippo_black', '#121014', rough=0.2)

# the body: rump to shoulders, then the neck and the head (x across, y along: the head toward -y, z up)
P = [
    (0, 1.35, -0.05, 0.62, 0.55), (0, 0.85, 0.0, 0.92, 0.72), (0, 0.25, 0.02, 0.98, 0.75), (0, -0.25, 0.05, 0.86, 0.68),
    (0, -0.6, 0.18, 0.62, 0.52), (0, -0.92, 0.3, 0.58, 0.42), (0, -1.25, 0.28, 0.66, 0.32), (0, -1.5, 0.26, 0.62, 0.27),
]
edges = [(i, i + 1) for i in range(len(P) - 1)]
body = apply(skin_body('body', P, edges, smooth=2, displace={'kind': 'CLOUDS', 'scale': 0.25, 'strength': 0.03}), tris=3600)
body.data.materials.append(skin)
body.data.materials.append(blush)
for p in body.data.polygons:
    c = p.center
    p.material_index = 1 if (c.y < -1.2 and c.z < 0.3) else 0
parts = []   # (details: joined after the skin is baked, keeping their own colours)
for s in (1, -1):
    # the eyes on top of the head (bumps, whites, dark irises), the small ears behind, the nostrils on the muzzle
    parts.append(prim('sphere', 'brow', loc=(s * 0.3, -0.86, 0.68), scale=(0.17, 0.15, 0.13), mat=skinPlain, segments=14, ring_count=8))
    parts.append(prim('sphere', 'eye', loc=(s * 0.33, -0.95, 0.74), scale=(0.08, 0.07, 0.07), mat=white, segments=12, ring_count=6))
    parts.append(prim('sphere', 'iris', loc=(s * 0.34, -1.01, 0.75), scale=(0.04, 0.025, 0.045), mat=black, segments=10, ring_count=6))
    parts.append(prim('sphere', 'ear', loc=(s * 0.36, -0.6, 0.78), scale=(0.07, 0.05, 0.11), rot=(0.4, 0, s * 0.3), mat=dark, segments=10, ring_count=6))
    parts.append(prim('sphere', 'nosebump', loc=(s * 0.2, -1.5, 0.5), scale=(0.12, 0.1, 0.08), mat=skinPlain, segments=12, ring_count=6))
    parts.append(prim('sphere', 'nostril', loc=(s * 0.2, -1.55, 0.565), scale=(0.045, 0.03, 0.02), mat=black, segments=8, ring_count=4))

# the lower jaw: wide, its lip pink inside, two tusks and small teeth at the front
J = [(0, -0.9, 0.05, 0.5, 0.18), (0, -1.25, 0.04, 0.6, 0.17), (0, -1.55, 0.06, 0.55, 0.14)]
jaw = apply(skin_body('jaw', J, [(0, 1), (1, 2)], smooth=2), tris=900)
jaw.data.materials.append(skin)
jparts = [prim('sphere', 'mouth', loc=(0, -1.25, 0.17), scale=(0.48, 0.38, 0.06), mat=mouth, segments=16, ring_count=8)]
for s in (1, -1):
    jparts.append(prim('cone', 'tusk', loc=(s * 0.42, -1.52, 0.3), scale=(0.055, 0.055, 0.2), rot=(0.25, 0, -s * 0.15), mat=tooth, vertices=8, radius1=1, depth=1))
    for k in (0.12, 0.24):
        jparts.append(prim('cone', 'tooth', loc=(s * k, -1.66, 0.24), scale=(0.035, 0.035, 0.09), rot=(0.4, 0, 0), mat=tooth, vertices=6, radius1=1, depth=1))
# the skin baked: blotchy grey-purple with pink about the face, soft shadows; wrinkles and pores in the normal map
detail(skin, 'noise', scale=5, mix=0.25, color2='#5e4f63')
detail(blush, 'noise', scale=8, mix=0.2, color2='#9a6f78')
highs = [high_copy(body, 1, {'kind': 'CLOUDS', 'scale': 0.06, 'strength': 0.035}), high_copy(jaw, 1, {'kind': 'CLOUDS', 'scale': 0.05, 'strength': 0.025})]
bake_set([body, jaw], 'hippo', size=1024, highs=highs)
body = join([body] + parts, 'body')
jaw = join([jaw] + jparts, 'jaw')
pivot(jaw, (0, -0.85, 0.12))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'hippo.glb')))
