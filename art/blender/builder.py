# (1.20) The rider: Stapel's builder on his surfboard (yellow hard hat, orange hi-vis vest with silver stripes and the
# X on the back, navy shirt, jeans, brown work boots, yellow gloves), and his bazooka. Each part is its own object at
# the world's origin, made in the frame of the joint js/rivier/rider.js turns it by (three's axes: x = his front,
# y = up, z = his left/right; a limb hangs from its joint down three's -y). Blender's (x, y, z) = three's (x, -z, y).
# Parts: thigh, shin (with the boot), pelvis, torso (vest, stripes), head (face, hard hat), upperarm, forearm (glove),
# board, bazooka. usage: Blender -b -P art/blender/builder.py -- img/models/builder.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, skin_body, apply, prim, join, pivot, export, detail, bake_set, high_copy

reset()
jeans = material('b_jeans', '#4a6494', rough=0.85)
jeansDark = material('b_jeansdark', '#2b3b58', rough=0.85)
shirt = material('b_shirt', '#2b3f5c', rough=0.8)
vest = material('b_vest', '#ff6a10', rough=0.55)
silver = material('b_silver', '#dfe6ec', rough=0.25, metal=0.4, emit='#9aa3aa', emit_k=0.2)
skin = material('b_skin', '#c08a62', rough=0.55)
boot = material('b_boot', '#5a3a20', rough=0.6)
sole = material('b_sole', '#241a12', rough=0.8)
hat = material('b_hat', '#ffc21a', rough=0.3, metal=0.05)
glove = material('b_glove', '#e9c35a', rough=0.7)
dark = material('b_dark', '#1c1a18', rough=0.4)
belt = material('b_belt', '#3a2616', rough=0.5, metal=0.1)
board_white = material('b_board', '#f6f1e6', rough=0.3)
board_yellow = material('b_boardstripe', '#ffbf1a', rough=0.3)
board_navy = material('b_boardnavy', '#1d2b45', rough=0.3)
board_red = material('b_boardred', '#e8462f', rough=0.3)
gun_olive = material('b_gun', '#6f7f45', rough=0.5, metal=0.25)
gun_dark = material('b_gundark', '#2a2f22', rough=0.45, metal=0.4)
gun_band = material('b_gunband', '#ffc21a', rough=0.4)

def T(x, y, z):
    """three's (x, y, z) as Blender's."""
    return (x, -z, y)

BASE = []   # (name, base mesh, details): the bases are baked into one texture set, then the details joined on
parts = []
# --- the thigh: from the hip down to the knee (0.56 m), jeans, a seam
thigh = apply(skin_body('thigh', [(*T(0, 0, 0), 0.12, 0.12), (*T(0, -0.3, 0.01), 0.11, 0.11), (*T(0, -0.56, 0), 0.092, 0.092)], [(0, 1), (1, 2)], smooth=2), tris=500)
thigh.data.materials.append(jeans)
BASE.append(('thigh', thigh, []))
# --- the shin: knee to ankle, then the boot (toe toward three's +z, the way rider.js puts it)
shin = apply(skin_body('shin', [(*T(0, 0, 0), 0.095, 0.095), (*T(0, -0.3, 0), 0.085, 0.085), (*T(0, -0.5, 0), 0.075, 0.075)], [(0, 1), (1, 2)], smooth=2), tris=420)
shin.data.materials.append(jeans)
cuff = prim('cyl', 'cuff', loc=T(0, -0.47, 0), scale=(0.088, 0.088, 0.04), mat=jeansDark, vertices=14)
bt = apply(skin_body('boot', [(*T(0, -0.52, -0.02), 0.085, 0.085), (*T(0, -0.6, 0.05), 0.085, 0.075), (*T(0, -0.62, 0.17), 0.075, 0.06)], [(0, 1), (1, 2)], smooth=2), tris=420)
bt.data.materials.append(boot)
solep = prim('cube', 'sole', loc=T(0, -0.665, 0.06), scale=(0.085, 0.16, 0.02), mat=sole)
BASE.append(('shin', join([shin, bt], 'shin'), [cuff, solep]))
# --- the pelvis: across (three's z), jeans with a belt
pel = apply(skin_body('pelvis', [(*T(0, 0, -0.2), 0.15, 0.14), (*T(0, 0.02, 0), 0.17, 0.15), (*T(0, 0, 0.2), 0.15, 0.14)], [(0, 1), (1, 2)], smooth=2), tris=500)
pel.data.materials.append(jeans)
bel = prim('torus', 'belt', loc=T(0, 0.09, 0), scale=(0.152, 0.205, 0.12), rot=(0, 0, 0), mat=belt, major_radius=1, minor_radius=0.14, major_segments=24, minor_segments=6)
buckle = prim('cube', 'buckle', loc=T(0.155, 0.09, 0), scale=(0.01, 0.035, 0.025), mat=silver)
BASE.append(('pelvis', pel, [bel, buckle]))
# --- the torso: waist to shoulders under the vest (front = three's +x, shoulders at three's z = ±0.22)
tor = apply(skin_body('torso', [(*T(0, 0.02, 0), 0.17, 0.19), (*T(0.01, 0.32, 0), 0.19, 0.22), (*T(0, 0.58, 0), 0.17, 0.26), (*T(0, 0.7, 0), 0.08, 0.08)], [(0, 1), (1, 2), (2, 3)], smooth=2), tris=900)
tor.data.materials.append(vest)
tor.data.materials.append(shirt)
for p in tor.data.polygons:
    # (the shirt shows at the collar)
    p.material_index = 1 if p.center.z > 0.66 else 0
T_ = [tor]
for y in (0.16, 0.27):
    T_.append(prim('torus', 'band', loc=T(0, y, 0), scale=(0.185, 0.215, 0.5), mat=silver, major_radius=1, minor_radius=0.05, major_segments=28, minor_segments=4))
# the X on his back (three's -x side)
for s in (1, -1):
    T_.append(prim('cube', 'x', loc=T(-0.185, 0.46, 0), scale=(0.008, 0.02, 0.2), rot=(s * 0.62, 0, 0), mat=silver))
neck = prim('cyl', 'neck', loc=T(0, 0.74, 0), scale=(0.065, 0.065, 0.07), mat=skin, vertices=12)
BASE.append(('torso', join([tor, neck], 'torso'), T_[1:]))
# --- the head: face toward three's +x; the hard hat on top
HB = [prim('sphere', 'skull', loc=(0, 0, 0), scale=(0.15, 0.145, 0.16), mat=skin, segments=20, ring_count=12)]
HB.append(prim('sphere', 'nose', loc=T(0.15, -0.01, 0), scale=(0.03, 0.025, 0.035), mat=skin, segments=10, ring_count=6))
HB.append(prim('sphere', 'jaw', loc=T(0.05, -0.07, 0), scale=(0.12, 0.12, 0.09), mat=skin, segments=14, ring_count=8))
H = []
for s in (1, -1):
    H.append(prim('sphere', 'eye', loc=T(0.135, 0.03, s * 0.055), scale=(0.012, 0.016, 0.016), mat=dark, segments=8, ring_count=6))
    H.append(prim('sphere', 'brow', loc=T(0.14, 0.065, s * 0.055), scale=(0.012, 0.035, 0.01), mat=dark, segments=8, ring_count=6))
    HB.append(prim('sphere', 'ear', loc=T(0, 0.0, s * 0.15), scale=(0.025, 0.035, 0.045), mat=skin, segments=10, ring_count=6))
H.append(prim('torus', 'smile', loc=T(0.135, -0.06, 0), scale=(0.035, 0.012, 0.03), rot=(0, 1.5708, 0), mat=dark, major_radius=1, minor_radius=0.3, major_segments=12, minor_segments=4))
dome = prim('sphere', 'dome', loc=T(0, 0.04, 0), scale=(0.18, 0.175, 0.17), mat=hat, segments=24, ring_count=12)
# (only the top half of the dome: the lower half sinks into the skull, hidden)
brim = prim('cyl', 'brim', loc=T(0.03, 0.05, 0), scale=(0.235, 0.22, 0.013), mat=hat, vertices=28)
ridge = prim('cube', 'ridge', loc=T(0.0, 0.2, 0), scale=(0.15, 0.025, 0.025), mat=hat)
H += [dome, brim, ridge]
BASE.append(('head', join(HB, 'head'), H))
# --- the arms: a sleeve (shoulder to elbow), the forearm and a glove
up = apply(skin_body('upperarm', [(*T(0, 0, 0), 0.075, 0.075), (*T(0, -0.33, 0), 0.06, 0.06)], [(0, 1)], smooth=2), tris=300)
up.data.materials.append(shirt)
BASE.append(('upperarm', up, []))
fa = apply(skin_body('forearm', [(*T(0, 0, 0), 0.058, 0.058), (*T(0, -0.3, 0), 0.046, 0.046)], [(0, 1)], smooth=2), tris=260)
fa.data.materials.append(skin)
gl = prim('sphere', 'glove', loc=T(0, -0.35, 0), scale=(0.06, 0.075, 0.05), mat=glove, segments=12, ring_count=8)
thumb = prim('sphere', 'thumb', loc=T(0.04, -0.33, 0.03), scale=(0.022, 0.035, 0.022), mat=glove, segments=8, ring_count=6)
cuffg = prim('cyl', 'glovecuff', loc=T(0, -0.29, 0), scale=(0.055, 0.055, 0.03), mat=glove, vertices=12)
BASE.append(('forearm', fa, [gl, thumb, cuffg]))
# --- the surfboard: nose toward three's -z (down the river), a rounded tail, a fin under it; stripes
B = []
outline = []
L = 2.3
for i in range(13):
    u = i / 12   # 0 = tail (three's +z), 1 = nose
    w = 0.29 * math.sin(math.pi * (0.12 + 0.82 * u)) ** 0.7
    outline.append((u, w))
bp = [(*T(0, 0.06 + (u ** 3) * 0.12, L / 2 - u * L), max(0.02, w), 0.035) for u, w in outline]
board = apply(skin_body('board', bp, [(i, i + 1) for i in range(len(bp) - 1)], smooth=1), tris=900)
board.data.materials.append(board_white)
board.data.materials.append(board_yellow)
board.data.materials.append(board_navy)
board.data.materials.append(board_red)
for p in board.data.polygons:
    c = p.center
    tz = -c.y  # three's z
    tx = c.x
    if abs(tx) < 0.06 and c.z > 0.06:
        p.material_index = 1
    elif abs(abs(tx) - 0.075) < 0.012 and c.z > 0.06:
        p.material_index = 2
    elif -0.82 < tz < -0.72:
        p.material_index = 3
fin = prim('cube', 'fin', loc=T(0, -0.03, 0.95), scale=(0.012, 0.09, 0.08), rot=(0.3, 0, 0), mat=board_navy)
BASE.append(('board', board, [fin]))
# --- the bazooka: along three's -z (the muzzle), its pivot at the shoulder rest
G = [prim('cyl', 'barrel', loc=(0, 0, 0), scale=(0.085, 0.085, 0.6), rot=(math.pi / 2, 0, 0), mat=gun_olive, vertices=18)]
G.append(prim('cone', 'bell', loc=T(0, 0, 0.7), scale=(0.135, 0.135, 0.11), rot=(-math.pi / 2, 0, 0), mat=gun_dark, vertices=18, radius1=1, radius2=0.63, depth=2))
G.append(prim('torus', 'muzzle', loc=T(0, 0, -0.6), scale=(0.09, 0.09, 0.09), rot=(math.pi / 2, 0, 0), mat=gun_dark, major_radius=1, minor_radius=0.25, major_segments=18, minor_segments=6))
for z in (-0.18, -0.08):
    G.append(prim('cyl', 'band', loc=T(0, 0, z), scale=(0.089, 0.089, 0.025), rot=(math.pi / 2, 0, 0), mat=gun_band, vertices=18))
G.append(prim('cube', 'sight', loc=T(0.0, 0.11, -0.25), scale=(0.015, 0.045, 0.04), mat=gun_dark))
G.append(prim('cube', 'grip', loc=T(0, -0.13, -0.12), scale=(0.025, 0.08, 0.03), rot=(0.25, 0, 0), mat=gun_dark))
G.append(prim('cube', 'trigger', loc=T(0, -0.08, -0.02), scale=(0.02, 0.05, 0.03), mat=gun_dark))
G.append(prim('cube', 'rest', loc=T(0, -0.09, 0.22), scale=(0.03, 0.05, 0.1), mat=gun_dark))
gun = join(G, 'bazooka')
pivot(gun, (0, 0, 0))
parts.append(gun)
# the bases baked into one texture set: denim weave on the jeans, a fabric grain on the vest and shirt, scuffed
# leather, warm skin, a glossy board; soft shadows in every fold; the weave and grain in the normal map
detail(jeans, 'stripes', scale=160, mix=0.22, color2='#3a5280')
detail(vest, 'noise', scale=60, mix=0.12, color2='#e65a08')
detail(shirt, 'noise', scale=50, mix=0.15)
detail(boot, 'noise', scale=14, mix=0.3, color2='#3c2614')
detail(skin, 'noise', scale=20, mix=0.08)
objs = [b for _, b, _ in BASE]
highs = [high_copy(b, 1, {'kind': 'STUCCI', 'scale': 0.004, 'strength': 0.003}) if n in ('thigh', 'shin', 'torso', 'upperarm', 'pelvis') else None for n, b, _ in BASE]
bake_set(objs, 'builder', size=1024, highs=highs)
for n, b, det in BASE:
    o = join([b] + det, n) if det else b
    o.name = n
    pivot(o, (0, 0, 0))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'builder.glb')))
