# (1.20, premium; rebuilt 29 Oct 2026: the owner, "The hippo also needs improvement please") The river's hippo, made to
# read like a game's star creature: a barrel of a body low in the water and the huge head that shows, one smooth hide
# (rounded shapes melted together): the wide muzzle with its overhanging upper lips, the jowls, sleepy eyes with heavy
# lids on turrets on top, small round ears (pink inside) on bumps at the back of the head, nostril mounds with dark
# slits; purple-grey on top fading to pink round the mouth, wet and glossy. Its yawn: a pink mouth, a tongue, two big
# curved tusks that hide behind the upper lips while it's shut, small teeth.
# Parts: 'body', 'jaw' (origin on the hinge; it opens by turning about x), 'earL' and 'earR' (each about its root).
# Head toward Blender -y (three's +z: it faces you as you come down the river). The waterline is z = 0.
# usage: Blender -b -P art/blender/hippo.py -- img/models/hippo.glb   (FAST=1: no bake, for trying shapes)
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import bpy
from mathutils import Vector
from common import reset, out_path, material, apply, prim, join, pivot, export, bake_set, high_copy, eye, gradient, palettize, detail, bands, blob, tube, surface

FAST = os.environ.get('FAST') == '1'
reset()
skin = material('hippo_skin', '#76698a', rough=0.32)
gradient(skin, '#6c6082', '#dd9ba6', 0.02, 0.62)
# (a hippo's hide: soft blotches of darker and lighter, faint folds across the back and neck)
bands(skin, scale=3.0, mix=0.07, color2='#52466a', axis='Y', distort=6)
detail(skin, 'noise', scale=3.0, mix=0.2, color2='#5c5076')
mouth = material('hippo_mouth', '#e57f8e', rough=0.38)
gum = material('hippo_gum', '#f0abb5', rough=0.4)
lidm = material('hippo_lid', '#76698a', rough=0.36)
pink = material('hippo_pink', '#f0a5b0', rough=0.4)
tooth = material('hippo_tooth', '#fbf4e2', rough=0.22)
dark = material('hippo_dark', '#2a1f2c', rough=0.3)

# the body and the head (x across, y along: the head toward -y, z up)
HEAD = [
    ((0, 0.55, -0.3), (0.9, 1.05, 0.62), 0),        # the barrel of the body, its back just out of the water
    ((0, -0.3, 0.06), (0.76, 0.55, 0.52), 0),       # the thick neck
    ((0, -0.62, 0.3), (0.56, 0.46, 0.36), 0),       # the top of the head
    ((0, -1.22, 0.28), (0.6, 0.6, 0.27), 0),        # the wide muzzle
    ((0.3, -1.55, 0.22), (0.35, 0.32, 0.27), 0),    # the upper lips, overhanging at the front corners
    ((-0.3, -1.55, 0.22), (0.35, 0.32, 0.27), 0),
    ((0.5, -0.82, 0.12), (0.3, 0.38, 0.3), 0),      # the jowls
    ((-0.5, -0.82, 0.12), (0.3, 0.38, 0.3), 0),
    ((0.3, -0.74, 0.62), (0.17, 0.15, 0.14), 0),    # the eye turrets
    ((-0.3, -0.74, 0.62), (0.17, 0.15, 0.14), 0),
    ((0.19, -1.58, 0.5), (0.12, 0.11, 0.08), 0),    # the nostril mounds
    ((-0.19, -1.58, 0.5), (0.12, 0.11, 0.08), 0),
    ((0.36, -0.32, 0.56), (0.11, 0.1, 0.09), 0),    # the ears' bumps
    ((-0.36, -0.32, 0.56), (0.11, 0.1, 0.09), 0),
]
body = apply(blob('body', HEAD, voxel=0.022, smooth=16, mat=skin), tris=4400)
# (the underside of the muzzle is the roof of the mouth: pink)
body.data.materials.append(mouth)
for p in body.data.polygons:
    if -1.74 < p.center.y < -0.95 and abs(p.center.x) < 0.44 and p.normal.z < -0.55:
        p.material_index = 1

# the lower jaw: wide and deep, the chin rounded; its top the gums (pink)
JAW = [
    ((0, -1.25, 0.0), (0.58, 0.52, 0.16), 0),
    ((0.27, -1.6, 0.0), (0.31, 0.27, 0.16), 0),
    ((-0.27, -1.6, 0.0), (0.31, 0.27, 0.16), 0),
    ((0, -0.9, 0.0), (0.5, 0.25, 0.15), 0),
]
jaw = apply(blob('jaw', JAW, voxel=0.02, smooth=12, mat=skin), tris=1300)
jaw.data.materials.append(gum)
for p in jaw.data.polygons:
    if -1.74 < p.center.y < -0.95 and abs(p.center.x) < 0.44 and p.normal.z > 0.5:
        p.material_index = 1

# the ears: small and round on their bumps, pink inside
ears, earin = [], {}
for s, nm in ((1, 'earL'), (-1, 'earR')):
    ears.append(prim('sphere', nm, loc=(s * 0.4, -0.31, 0.7), scale=(0.075, 0.05, 0.12), rot=(0.25, 0, s * 0.45), mat=lidm, segments=14, ring_count=8))
    earin[s] = prim('sphere', 'earin', loc=(s * 0.4, -0.35, 0.71), scale=(0.045, 0.02, 0.08), rot=(0.25, 0, s * 0.45), mat=pink, segments=10, ring_count=6)

# the hide baked into one texture set (purple-grey over pink, soft shadow in the folds); the pores in the normal map
if not FAST:
    highs = [high_copy(body, 1, {'kind': 'CLOUDS', 'scale': 0.05, 'strength': 0.022}), high_copy(jaw, 1, {'kind': 'CLOUDS', 'scale': 0.06, 'strength': 0.014}), None, None]
    bake_set([body, jaw] + ears, 'hippo', size=1024, highs=highs, ao_dist=0.3, ao_k=0.5)

det = []
for s in (1, -1):
    # sleepy eyes in the front of their turrets, looking ahead, a heavy upper lid
    at, _ = surface(body, (s * 0.3, -1.6, 0.66), (0, 1, 0))
    det += eye(f'eye{s}', tuple(at + Vector((0, 0.045, 0))), 0.085, (s * 0.25, -1.0, 0.25), iris='#5a3418', pupil='round', lid=0.5, lid_mat=lidm, low_lid=0.15, iris_k=0.7)
    # dark slits on top of the nostril mounds
    at, _ = surface(body, (s * 0.19, -1.6, 1.5), (0, 0, -1))
    det.append(prim('sphere', 'nostril', loc=tuple(at + Vector((0, 0, -0.008))), scale=(0.055, 0.025, 0.018), rot=(0, 0, s * 0.5), mat=dark, segments=10, ring_count=6))
    # small teeth along the front of the roof, pointing down
    for k, y in ((0.12, -1.7), (0.26, -1.64)):
        at, _ = surface(body, (s * k, y, -1.0), (0, 0, 1))
        det.append(prim('cone', 'uptooth', loc=tuple(at + Vector((0, 0, -0.03))), scale=(0.03, 0.03, 0.06), rot=(math.pi, 0, 0), mat=tooth, vertices=8, radius1=1, depth=1))
# the jaw's inside: the tongue, two big curved tusks at its corners, small teeth at the front pointing forward
jd = [prim('sphere', 'tongue', loc=(0, -1.22, 0.13), scale=(0.28, 0.3, 0.06), mat=mouth, segments=16, ring_count=8)]
for s in (1, -1):
    jd.append(apply(tube('tusk', [(s * 0.42, -1.5, 0.04), (s * 0.44, -1.56, 0.2), (s * 0.39, -1.63, 0.34)], [0.07, 0.055, 0.022], ds=0.03, ring=12, mat=tooth, tip=0.6), tris=220))
    for k in (0.1, 0.21):
        at, _ = surface(jaw, (s * k, -2.5, 0.06), (0, 1, 0))
        jd.append(prim('cone', 'tooth', loc=tuple(at + Vector((0, 0.02, 0.02))), scale=(0.032, 0.032, 0.07), rot=(-1.1, 0, 0), mat=tooth, vertices=8, radius1=1, depth=1))

# (all the small parts' colours in one palette: two draw calls a part on the phone)
palettize(det + jd + list(earin.values()), 'hippo', rough=0.32)
body = join([body] + det, 'body')
jaw = join([jaw] + jd, 'jaw')
pivot(jaw, (0, -0.86, 0.1))
for e, s in zip(ears, (1, -1)):
    nm = e.name
    e = join([e, earin[s]], nm)
    pivot(e, (s * 0.37, -0.31, 0.6))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'hippo.glb')))
