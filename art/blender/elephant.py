# (1.21.3, rebuilt 29 Oct 2026: the owner, "The elephants graphics are also very poor") The river's elephants from
# 10 km: an African elephant cow wading across, her calf behind (the same model, smaller). One smooth hide from the rump
# to the face (rounded shapes melted together into one skin, not a chain of blobs): a high shoulder, a back that dips
# and a round rump, a domed head with cheeks; a heavy trunk that grows out of the face, ringed down its length, curling
# up at its tip; great fan ears shaped like Africa, standing off the shoulders; columns of legs, wrinkled at the knees;
# curved ivory tusks from their sheaths; kind eyes under heavy lids; a thin tail with a tuft. Warm grey, darker and wet
# below. She stands in the water to her knees (the waterline is z = 0).
# Parts: 'body' (head, back, tusks, eyes, tail), 'trunk' (origin at its root: it swings), 'earL', 'earR' (each about
# its front edge: they flap), 'legFL', 'legFR', 'legBL', 'legBR' (each about its hip: she walks).
# Head toward Blender -y (three's +z); the game turns her to walk across the river.
# usage: Blender -b -P art/blender/elephant.py -- img/models/elephant.glb   (FAST=1: no bake, for trying shapes)
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
import bpy
import bmesh
from mathutils import Vector, Matrix
from common import reset, out_path, material, link, apply, prim, join, pivot, export, bake_set, high_copy, eye, gradient, palettize, detail, bands, blob, tube, surface

FAST = os.environ.get('FAST') == '1'
reset()
skin = material('ele_skin', '#948e88', rough=0.68)
gradient(skin, '#9d9791', '#5f5953', 0.25, 3.3)
# (an elephant's hide: creased across, mottled darker and lighter, a little mud)
bands(skin, scale=11.0, mix=0.12, color2='#7a746e', axis='Z', distort=5)
detail(skin, 'noise', scale=4.0, mix=0.15, color2='#8a7f73')
earSkin = material('ele_ear', '#928b85', rough=0.64)
gradient(earSkin, '#9a938c', '#7f7871', 1.9, 3.5)
detail(earSkin, 'noise', scale=3.0, mix=0.14, color2='#a08884')
earIn = material('ele_ear_in', '#a8908a', rough=0.6)   # (the inside, toward her: pinker, the veins showing)
detail(earIn, 'noise', scale=6.0, mix=0.22, color2='#8d6f6c')
ivory = material('ele_ivory', '#f1e7cf', rough=0.32)
lid = material('ele_lid', '#857e78', rough=0.6)
tuft = material('ele_tuft', '#2b2522', rough=0.85)
tailSkin = material('ele_tail', '#6e6862', rough=0.7)
nose = material('ele_nose', '#3a3330', rough=0.5)


# ------------------------------------------------------------------------------------------------ the hide
# (x across, y along: the head toward -y, z up; the belly about 1.2 m over the water)
BODY = [
    ((0, 0.15, 2.38), (1.0, 1.48, 0.98), 0),      # the barrel of her chest and belly
    ((0, -0.82, 2.6), (0.94, 0.92, 0.96), 0),     # the high shoulders
    ((0, 1.24, 2.4), (0.9, 0.86, 0.98), 0),       # the round rump, a little lower
    ((0, 0.1, 1.95), (0.88, 1.15, 0.56), 0),      # the belly's curve
    ((0, -1.42, 2.72), (0.8, 0.62, 0.84), 0),     # the short neck
    ((0, -2.0, 2.92), (0.74, 0.76, 0.8), 0),      # the domed head
    ((0, -2.36, 2.92), (0.56, 0.42, 0.6), 0.3),   # the brow over the trunk
    ((0.38, -2.18, 2.56), (0.4, 0.5, 0.46), 0),   # the cheeks
    ((-0.38, -2.18, 2.56), (0.4, 0.5, 0.46), 0),
    ((0, -2.56, 2.5), (0.38, 0.32, 0.56), 0.25),  # the face's root of the trunk
    ((0, -2.3, 2.02), (0.2, 0.24, 0.13), 0.3),    # the lower lip
    ((0.33, -2.46, 2.14), (0.15, 0.16, 0.15), 0), # the tusks' sheaths
    ((-0.33, -2.46, 2.14), (0.15, 0.16, 0.15), 0),
    ((0.6, -0.8, 1.86), (0.5, 0.55, 0.62), 0),    # the tops of the front legs
    ((-0.6, -0.8, 1.86), (0.5, 0.55, 0.62), 0),
    ((0.55, 1.18, 1.94), (0.55, 0.66, 0.76), 0),  # the hind thighs
    ((-0.55, 1.18, 1.94), (0.55, 0.66, 0.76), 0),
    ((0, 2.04, 2.7), (0.16, 0.2, 0.16), 0),       # the root of the tail
]
body = blob('body', BODY, mat=skin)
body = apply(body, tris=4800)

# the trunk: out of the face, down and a little forward, its tip curling forward and up just over the water; ringed
# down its front
TRUNK = [(0, -2.5, 2.62), (0, -2.78, 2.1), (0, -2.9, 1.5), (0, -2.93, 0.96), (0, -3.0, 0.56), (0, -3.18, 0.36), (0, -3.38, 0.4), (0, -3.5, 0.58)]
TRUNK_R = [0.36, 0.31, 0.25, 0.2, 0.16, 0.14, 0.125, 0.12]
trunk = tube('trunk', TRUNK, TRUNK_R, ds=0.08, ring=18, mat=skin, tip=0.25, flat=0.9)
trunk = apply(trunk, tris=900)
trunkHi = tube('trunkHi', TRUNK, TRUNK_R, ds=0.012, ring=40, ridge=(0.085, 0.07, 0.12, 0.95, (0, -1, 0.35)), mat=skin, tip=0.25, flat=0.9)


# the ears: great fans, Africa's shape (a round top and back, the lobe hanging down in front), thick in the middle, thin
# at the rim, cupped and standing off the shoulders
EAR = [(0.0, 0.1), (0.3, 0.3), (0.68, 0.3), (1.0, 0.16), (1.2, -0.1), (1.22, -0.45), (1.06, -0.78), (0.82, -1.04), (0.6, -1.3), (0.4, -1.48), (0.24, -1.42), (0.13, -1.12), (0.05, -0.72), (0.0, -0.32)]


def ear(name, s):
    P = [Vector((u, v)) for u, v in EAR]
    loop = []
    for i in range(len(P)):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % len(P)], P[(i + 2) % len(P)]
        for k in range(6):
            t = k / 6
            loop.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    c = sum(loop, Vector((0, 0))) / len(loop)
    R = 9
    A = 0.36   # (how far the back edge stands off the shoulder: radians)
    bm = bmesh.new()

    def at(p, side, rho):
        u, v = p.x, p.y
        th = 0.075 * math.sqrt(max(0.0, 1 - rho ** 6)) * 0.5
        t = side * th + 0.16 * (u / 1.22) ** 2 + 0.05 * (1 - rho * rho)
        return Vector((s * (0.6 + t * math.cos(A) + u * math.sin(A)), -1.9 + u * math.cos(A) - t * math.sin(A), 3.32 + v))
    rims = [bm.verts.new(at(q, 0, 1.0)) for q in loop]
    faces = {1: [], -1: []}
    for side in (1, -1):
        prev = rims
        for k in range(R - 1, 0, -1):
            rho = k / R
            cur = [bm.verts.new(at(c + (q - c) * rho, side, rho)) for q in loop]
            for i in range(len(loop)):
                j = (i + 1) % len(loop)
                f = bm.faces.new((prev[i], prev[j], cur[j], cur[i]))
                faces[side].append(f)
            prev = cur
        mid = bm.verts.new(at(c, side, 0.0))
        for i in range(len(loop)):
            faces[side].append(bm.faces.new((prev[i], prev[(i + 1) % len(loop)], mid)))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    # (the side toward her is the pink inside: material 1)
    for f in faces[-1]:
        f.material_index = 1
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me))
    o.data.materials.append(earSkin)
    o.data.materials.append(earIn)
    for p in o.data.polygons:
        p.use_smooth = True
    return apply(o, tris=640)


ears = [ear('earL', 1), ear('earR', -1)]

# the legs: columns from the hips into the water, a little wider at the foot, the knees creased
LEGS = (('legFL', 0.6, -0.8, True), ('legFR', -0.6, -0.8, True), ('legBL', 0.55, 1.18, False), ('legBR', -0.55, 1.18, False))
legs, legHis = [], []
for nm, x, y, front in LEGS:
    if front:
        pts = [(x, y, 2.2), (x * 1.02, y - 0.02, 1.3), (x * 1.02, y - 0.04, 0.62), (x, y - 0.02, 0.1), (x, y, -0.5)]
        rr = [0.36, 0.42, 0.38, 0.39, 0.44]
    else:
        pts = [(x, y, 2.3), (x, y + 0.05, 1.35), (x, y - 0.06, 0.72), (x, y, 0.1), (x, y, -0.5)]
        rr = [0.38, 0.45, 0.38, 0.39, 0.44]
    lg = apply(tube(nm, pts, rr, ds=0.1, ring=16, mat=skin, tip=0.1), tris=420)
    legs.append(lg)
    legHis.append(tube(nm + 'Hi', pts, rr, ds=0.015, ring=40, ridge=(0.07, 0.05, 0.38, 0.72, (0, -1 if front else 1, 0)), mat=skin, tip=0.1))

# colour x soft shadow baked into one texture set; the creases in the normal map from finer copies
parts = [body, trunk] + ears + legs
if not FAST:
    highs = [high_copy(body, 2, {'kind': 'CLOUDS', 'scale': 0.09, 'strength': 0.016}), trunkHi, None, None] + legHis
    bake_set(parts, 'elephant', size=1024, highs=highs, ao_dist=0.35, ao_k=0.5)
else:
    # (the bake takes its finer copies away itself)
    for o in [trunkHi] + legHis:
        bpy.data.objects.remove(o, do_unlink=True)

det = []
for s in (1, -1):
    # kind eyes under heavy lids, low on the head's sides, just in front of the ears
    at, nrm = surface(body, (s * 1.5, -2.36, 2.84), (-s, 0.1, 0))
    det += eye(f'eye{s}', tuple(at - Vector((s * 0.035, 0, 0))), 0.078, (s * 0.95, -0.9, 0.12), iris='#3a2414', pupil='round', lid=0.42, lid_mat=lid, low_lid=0.16, iris_k=0.72)
    # the tusks: out of their sheaths beside the trunk, forward and down, then up at the tips
    root, _ = surface(body, (s * 0.34, -3.2, 2.12), (0, 1, 0))
    tk = tube(f'tusk{s}', [tuple(root + Vector((0, 0.08, 0))), (s * 0.4, -2.74, 1.86), (s * 0.43, -3.04, 1.76), (s * 0.41, -3.3, 1.86), (s * 0.36, -3.42, 2.04)], [0.11, 0.095, 0.074, 0.048, 0.02], ds=0.04, ring=12, mat=ivory, tip=0.6)
    det.append(apply(tk, tris=320))
# the tail: thin, hanging from the rump, a dark tuft at its end
tail = tube('tail', [(0, 2.06, 2.76), (0, 2.28, 2.32), (0, 2.36, 1.77), (0, 2.36, 1.34)], [0.07, 0.055, 0.045, 0.04], ds=0.06, ring=10, mat=tailSkin)
det.append(apply(tail, tris=200))
det.append(prim('sphere', 'tuft', loc=(0, 2.36, 1.22), scale=(0.08, 0.06, 0.15), mat=tuft, segments=10, ring_count=6))
# the trunk's tip: two dark nostrils (joined onto the trunk)
tipC = Vector(TRUNK[-1])
tipT = (tipC - Vector(TRUNK[-2])).normalized()
nostrils = [prim('sphere', f'nostril{s}', loc=tuple(tipC + tipT * 0.005 + Vector((s * 0.042, 0, 0))), scale=(0.024, 0.024, 0.024), mat=nose, segments=10, ring_count=6) for s in (1, -1)]
palettize(det + nostrils, 'elephant', rough=0.4)
body = join([body] + det, 'body')
trunk = join([trunk] + nostrils, 'trunk')
pivot(trunk, (0, -2.5, 2.6))
for e, s in zip(ears, (1, -1)):
    pivot(e, (s * 0.6, -1.9, 3.15))
for lg, (_, x, y, _) in zip(legs, LEGS):
    pivot(lg, (x, y, 1.7))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'elephant.glb')))
