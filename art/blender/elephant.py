# (1.21.3) The river's elephants from 10 km (the owner, 25 Oct 2026: "And then please add objects at 5000 and 10000
# meters"): an African elephant cow wading across, her calf behind (the same model, smaller). A big domed head, the huge
# fan ears that flap, a long trunk that swings and curls at its tip, two ivory tusks, small wise eyes under heavy lids,
# a broad back sloping to the rump, a thin tail with a tuft; grey and wrinkled, darker and wet below. She stands in the
# water to her knees (the waterline is z = 0).
# Parts: 'body' (head, back and tail), 'trunk' (origin at its root: it swings), 'earL', 'earR' (each about its front edge:
# they flap), 'legFL', 'legFR', 'legBL', 'legBR' (each about its hip: she walks).
# Head toward Blender -y (three's +z); the game turns her to walk across the river.
# usage: Blender -b -P art/blender/elephant.py -- img/models/elephant.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, skin_body, apply, prim, join, pivot, export, bake_set, high_copy, eye, gradient, palettize, detail, bands

reset()
skin = material('ele_skin', '#7c7a76', rough=0.66)
gradient(skin, '#8a8884', '#57554f', 0.2, 2.9)
# (an elephant's hide: deep wrinkles across, mottled darker and lighter)
bands(skin, scale=9.0, mix=0.12, color2='#6d6b67', axis='Z', distort=4)
detail(skin, 'noise', scale=5.0, mix=0.16, color2='#7b7975')
earSkin = material('ele_ear', '#7a7773', rough=0.64)
gradient(earSkin, '#85827d', '#6a6560', 1.6, 3.4)
detail(earSkin, 'noise', scale=4.0, mix=0.18, color2='#b59a94')
ivory = material('ele_ivory', '#efe5cb', rough=0.3)
lid = material('ele_lid', '#7e7873', rough=0.6)
dark = material('ele_dark', '#1f1b19', rough=0.4)
tuft = material('ele_tuft', '#2b2522', rough=0.8)

# the body: rump to the domed head (x across, y along: the head toward -y, z up); belly about 0.9 m over the water
P = [
    (0, 1.8, 2.05, 0.8, 0.85), (0, 1.25, 2.3, 1.12, 1.12), (0, 0.35, 2.2, 1.28, 1.22), (0, -0.55, 2.35, 1.2, 1.24),
    (0, -1.2, 2.5, 0.82, 0.86), (0, -1.68, 2.88, 0.86, 0.92), (0, -2.12, 2.98, 0.78, 0.86), (0, -2.42, 2.55, 0.56, 0.66),
]
edges = [(i, i + 1) for i in range(len(P) - 1)]
body = apply(skin_body('body', P, edges, smooth=2), tris=5200)
body.data.materials.append(skin)
# the tail: thin, hanging from the rump, a dark tuft at its end
tail = apply(skin_body('tail', [(0, 2.2, 2.45, 0.08, 0.08), (0, 2.45, 1.85, 0.05, 0.05), (0, 2.5, 1.2, 0.045, 0.045)], [(0, 1), (1, 2)], smooth=1), tris=160)
tail.data.materials.append(skin)

# the trunk: from the face down to the water, its tip curling forward
T = [(0, -2.55, 2.32, 0.34, 0.32), (0, -2.78, 1.75, 0.27, 0.26), (0, -2.9, 1.18, 0.21, 0.2), (0, -2.88, 0.66, 0.16, 0.16), (0, -2.72, 0.36, 0.13, 0.13), (0, -2.55, 0.42, 0.11, 0.11)]
trunk = apply(skin_body('trunk', T, [(i, i + 1) for i in range(len(T) - 1)], smooth=2), tris=1100)
trunk.data.materials.append(skin)

# the ears: huge fans either side of the head, thin, a little cupped
ears = []
for s, nm in ((1, 'earL'), (-1, 'earR')):
    # (hanging back along the head's side, a little out from it; taller than wide, the lobe at the bottom)
    e = prim('sphere', nm, loc=(s * 0.78, -1.32, 2.48), scale=(0.06, 0.7, 1.02), rot=(-0.12, 0, s * 0.22), mat=earSkin, segments=22, ring_count=14)
    for v in e.data.vertices:
        if v.co.z < 2.2:
            v.co.y += (2.2 - v.co.z) * 0.18   # (the lobe swept back)
    ears.append(e)

# the legs: thick columns from the hips into the water
legs = []
for nm, x, y in (('legFL', 0.58, -0.75), ('legFR', -0.58, -0.75), ('legBL', 0.55, 1.15), ('legBR', -0.55, 1.15)):
    lg = apply(skin_body(nm, [(x, y, 1.7, 0.42, 0.42), (x, y, 0.75, 0.35, 0.35), (x, y, -0.5, 0.37, 0.37)], [(0, 1), (1, 2)], smooth=2), tris=520)
    lg.data.materials.append(skin)
    legs.append(lg)

# colour x soft shadow baked into one texture set; the wrinkles in the normal map from finer copies
parts = [body, trunk] + ears + legs
highs = [high_copy(body, 1, {'kind': 'CLOUDS', 'scale': 0.06, 'strength': 0.035}), high_copy(trunk, 1, {'kind': 'CLOUDS', 'scale': 0.04, 'strength': 0.02}), None, None, None, None, None, None]
bake_set(parts, 'elephant', size=1024, highs=highs, ao_dist=0.35, ao_k=0.5)

det = []
for s in (1, -1):
    # small wise eyes under heavy lids, set low on the head's sides
    det += eye(f'eye{s}', (s * 0.5, -2.2, 2.62), 0.07, (s * 0.9, -1.0, 0.2), iris='#3a2414', pupil='round', lid=0.45, lid_mat=lid, low_lid=0.2, iris_k=0.7)
    # the tusks: two long ivory curves from beside the trunk's root, forward and down, then up at the tips
    tk = apply(skin_body(f'tusk{s}', [(s * 0.27, -2.42, 2.02, 0.09, 0.09), (s * 0.33, -2.72, 1.72, 0.08, 0.08), (s * 0.35, -3.05, 1.6, 0.065, 0.065), (s * 0.32, -3.32, 1.72, 0.045, 0.045), (s * 0.28, -3.45, 1.92, 0.025, 0.025)], [(0, 1), (1, 2), (2, 3), (3, 4)], smooth=2), tris=300)
    tk.data.materials.append(ivory)
    det.append(tk)
det.append(prim('sphere', 'tuft', loc=(0, 2.5, 1.12), scale=(0.08, 0.06, 0.13), mat=tuft, segments=10, ring_count=6))
palettize(det, 'elephant', rough=0.4)
body = join([body, tail] + det, 'body')
pivot(trunk, (0, -2.5, 2.35))
for e, s in zip(ears, (1, -1)):
    pivot(e, (s * 0.62, -1.95, 2.7))
for lg, (x, y) in zip(legs, ((0.58, -0.75), (-0.58, -0.75), (0.55, 1.15), (-0.55, 1.15))):
    pivot(lg, (x, y, 1.7))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'elephant.glb')))
