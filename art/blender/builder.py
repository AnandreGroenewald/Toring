# (1.20) The rider: Stapel's builder on his surfboard (yellow hard hat, orange hi-vis vest with silver stripes and the
# X on the back, navy shirt, jeans, brown work boots, yellow gloves), and his water cannon with its tank. Each part is its own object at
# the world's origin, made in the frame of the joint js/rivier/rider.js turns it by (three's axes: x = his front,
# y = up, z = his left/right; a limb hangs from its joint down three's -y). Blender's (x, y, z) = three's (x, -z, y).
# Parts: thigh, shin (with the boot), pelvis, torso (vest, stripes), head (face, hard hat), upperarm, forearm (glove),
# board, cannon (the water cannon), tank (on his back), tankwater. usage: Blender -b -P art/blender/builder.py -- img/models/builder.glb
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

def T(x, y, z):
    """three's (x, y, z) as Blender's."""
    return (x, -z, y)

BASE = []   # (name, base mesh, details): the bases are baked into one texture set, then the details joined on
parts = []
# --- the thigh: from the hip down to the knee (0.56 m), jeans, a seam
thigh = apply(skin_body('thigh', [(*T(0, 0, 0), 0.14, 0.14), (*T(0, -0.3, 0.01), 0.125, 0.125), (*T(0, -0.56, 0), 0.1, 0.1)], [(0, 1), (1, 2)], smooth=2), tris=500)
thigh.data.materials.append(jeans)
BASE.append(('thigh', thigh, []))
# --- the shin: knee to ankle, then the boot (toe toward three's +z, the way rider.js puts it)
shin = apply(skin_body('shin', [(*T(0, 0, 0), 0.105, 0.105), (*T(0, -0.3, 0), 0.095, 0.095), (*T(0, -0.5, 0), 0.088, 0.088)], [(0, 1), (1, 2)], smooth=2), tris=420)
shin.data.materials.append(jeans)
cuff = prim('cyl', 'cuff', loc=T(0, -0.47, 0), scale=(0.1, 0.1, 0.045), mat=jeansDark, vertices=16)
bt = apply(skin_body('boot', [(*T(0, -0.5, -0.03), 0.1, 0.1), (*T(0, -0.6, 0.05), 0.1, 0.085), (*T(0, -0.62, 0.21), 0.09, 0.07)], [(0, 1), (1, 2)], smooth=2), tris=480)
bt.data.materials.append(boot)
solep = prim('cube', 'sole', loc=T(0, -0.68, 0.08), scale=(0.1, 0.2, 0.025), mat=sole)
BASE.append(('shin', join([shin, bt], 'shin'), [cuff, solep]))
# --- the pelvis: across (three's z), jeans with a belt
pel = apply(skin_body('pelvis', [(*T(0, 0, -0.21), 0.16, 0.15), (*T(0, 0.02, 0), 0.18, 0.16), (*T(0, 0, 0.21), 0.16, 0.15)], [(0, 1), (1, 2)], smooth=2), tris=500)
pel.data.materials.append(jeans)
bel = prim('torus', 'belt', loc=T(0, 0.09, 0), scale=(0.168, 0.222, 0.12), rot=(0, 0, 0), mat=belt, major_radius=1, minor_radius=0.14, major_segments=24, minor_segments=6)
buckle = prim('cube', 'buckle', loc=T(0.17, 0.09, 0), scale=(0.012, 0.04, 0.03), mat=silver)
wood = material('b_wood', '#9a6a3c', rough=0.6)
handle = prim('cyl', 'hammerhandle', loc=T(0.06, -0.08, -0.25), scale=(0.018, 0.018, 0.16), rot=(0, 0, 0), mat=wood, vertices=8)
hhead = prim('cube', 'hammerhead', loc=T(0.06, 0.08, -0.25), scale=(0.075, 0.022, 0.026), mat=steelish if False else silver)
loop_ = prim('torus', 'hammerloop', loc=T(0.06, 0.06, -0.25), scale=(0.035, 0.035, 0.04), mat=belt, major_radius=1, minor_radius=0.25, major_segments=12, minor_segments=4)
BASE.append(('pelvis', pel, [bel, buckle, handle, hhead, loop_]))
# --- the torso: waist to shoulders under the vest (front = three's +x, shoulders at three's z = ±0.22)
tor = apply(skin_body('torso', [(*T(0, 0.02, 0), 0.18, 0.21), (*T(0.015, 0.32, 0), 0.21, 0.25), (*T(0, 0.58, 0), 0.19, 0.3), (*T(0, 0.7, 0), 0.09, 0.09)], [(0, 1), (1, 2), (2, 3)], smooth=2), tris=900)
tor.data.materials.append(vest)
tor.data.materials.append(shirt)
for p in tor.data.polygons:
    # (the shirt shows at the collar)
    p.material_index = 1 if p.center.z > 0.66 else 0
T_ = [tor]
for y in (0.16, 0.27):
    T_.append(prim('torus', 'band', loc=T(0, y, 0), scale=(0.2, 0.24, 0.5), mat=silver, major_radius=1, minor_radius=0.05, major_segments=28, minor_segments=4))
# the X on his back (three's -x side)
for s in (1, -1):
    T_.append(prim('cube', 'x', loc=T(-0.2, 0.46, 0), scale=(0.008, 0.02, 0.2), rot=(s * 0.62, 0, 0), mat=silver))
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
up = apply(skin_body('upperarm', [(*T(0, 0, 0), 0.088, 0.088), (*T(0, -0.33, 0), 0.07, 0.07)], [(0, 1)], smooth=2), tris=300)
up.data.materials.append(shirt)
BASE.append(('upperarm', up, []))
fa = apply(skin_body('forearm', [(*T(0, 0, 0), 0.068, 0.068), (*T(0, -0.3, 0), 0.054, 0.054)], [(0, 1)], smooth=2), tris=260)
fa.data.materials.append(skin)
gl = prim('sphere', 'glove', loc=T(0, -0.36, 0), scale=(0.072, 0.088, 0.06), mat=glove, segments=12, ring_count=8)
thumb = prim('sphere', 'thumb', loc=T(0.04, -0.33, 0.03), scale=(0.022, 0.035, 0.022), mat=glove, segments=8, ring_count=6)
cuffg = prim('cyl', 'glovecuff', loc=T(0, -0.29, 0), scale=(0.066, 0.066, 0.035), mat=glove, vertices=12)
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
# --- the water cannon (Saturday): along three's -z (the nozzle), its pivot at the shoulder rest. A glossy white
# shell with a clear pressure chamber you can see the water in (teal collars, brass rings), a chrome barrel and a brass
# nozzle, an orange pump grip (his vest's colour), a scope on top with a cyan lens, a pressure gauge on its right side,
# the hose's port at the back. (Blender's (x, y, z) = three's (x, -z, y); a cylinder stands along Blender's z.)
import bpy
cn_white = material('c_white', '#f2f5f7', rough=0.22)
cn_teal = material('c_teal', '#0fa3bd', rough=0.18, metal=0.05)
cn_chrome = material('c_chrome', '#dfe7ee', rough=0.16, metal=0.95)
cn_brass = material('c_brass', '#e2aa3c', rough=0.22, metal=0.85)
cn_black = material('c_black', '#16191e', rough=0.45, metal=0.2)
cn_orange = material('c_orange', '#ff6a10', rough=0.4)
cn_lens = material('c_lens', '#5ff2ff', rough=0.05, emit='#38e8ff', emit_k=2.0)
cn_glass = material('c_glass', '#9feef7', rough=0.04)
cn_glass.node_tree.nodes.get('Principled BSDF').inputs['Alpha'].default_value = 0.35
cn_glass.blend_method = 'BLEND'
cn_water = material('c_water', '#16c4e8', rough=0.08, emit='#0a9cc4', emit_k=0.4)
cn_red = material('c_red', '#e3262b', rough=0.4)
ALONG = (math.pi / 2, 0, 0)   # (a cylinder or ring along three's z)
C = [apply(skin_body('cshell', [(*T(0, 0, 0.44), 0.07, 0.07), (*T(0, 0, 0.32), 0.12, 0.115), (*T(0, 0, 0.27), 0.122, 0.118)], [(0, 1), (1, 2)], smooth=2), tris=700)]
C[0].data.materials.append(cn_white)
C.append(apply(skin_body('cfront', [(*T(0, 0, 0.07), 0.122, 0.118), (*T(0, -0.005, -0.12), 0.095, 0.09), (*T(0, -0.01, -0.22), 0.06, 0.06)], [(0, 1), (1, 2)], smooth=2), tris=700))
C[-1].data.materials.append(cn_white)
# (the pressure chamber: teal collars at its ends, clear glass between with the water in it)
for z in (0.085, 0.255):
    C.append(prim('cyl', 'collar', loc=T(0, 0, z), scale=(0.13, 0.13, 0.018), rot=ALONG, mat=cn_teal, vertices=28))
C.append(prim('cyl', 'window', loc=T(0, 0, 0.17), scale=(0.124, 0.124, 0.068), rot=ALONG, mat=cn_glass, vertices=28))
C.append(prim('cyl', 'water', loc=T(0, -0.012, 0.17), scale=(0.108, 0.108, 0.066), rot=ALONG, mat=cn_water, vertices=24))
for z in (0.06, 0.28):
    C.append(prim('torus', 'ring', loc=T(0, 0, z), scale=(0.124, 0.124, 0.124), rot=ALONG, mat=cn_brass, major_radius=1, minor_radius=0.06, major_segments=28, minor_segments=6))
# the barrel and the nozzle
C.append(prim('cyl', 'barrel', loc=T(0, -0.01, -0.4), scale=(0.048, 0.048, 0.2), rot=ALONG, mat=cn_chrome, vertices=20))
for z in (-0.3, -0.42, -0.54):
    C.append(prim('torus', 'rib', loc=T(0, -0.01, z), scale=(0.05, 0.05, 0.05), rot=ALONG, mat=cn_chrome, major_radius=1, minor_radius=0.18, major_segments=20, minor_segments=6))
C.append(prim('cone', 'nozzle', loc=T(0, -0.01, -0.65), scale=(0.07, 0.07, 0.06), rot=(-math.pi / 2, 0, 0), mat=cn_brass, vertices=20, radius1=0.62, radius2=1.0, depth=2))
C.append(prim('torus', 'tip', loc=T(0, -0.01, -0.71), scale=(0.07, 0.07, 0.07), rot=ALONG, mat=cn_brass, major_radius=1, minor_radius=0.2, major_segments=20, minor_segments=6))
C.append(prim('cyl', 'bore', loc=T(0, -0.01, -0.712), scale=(0.035, 0.035, 0.004), rot=ALONG, mat=cn_black, vertices=16))
# the pump grip under the barrel (orange, ribbed) and the pistol grip
C.append(prim('cyl', 'pump', loc=T(0, -0.1, -0.33), scale=(0.042, 0.042, 0.11), rot=ALONG, mat=cn_orange, vertices=16))
for z in (-0.26, -0.3, -0.34, -0.38):
    C.append(prim('torus', 'pumprib', loc=T(0, -0.1, z), scale=(0.044, 0.044, 0.044), rot=ALONG, mat=cn_orange, major_radius=1, minor_radius=0.15, major_segments=16, minor_segments=5))
C.append(prim('cube', 'grip', loc=T(0, -0.15, 0.05), scale=(0.03, 0.075, 0.036), rot=(0.3, 0, 0), mat=cn_black))
C.append(prim('cube', 'trigger', loc=T(0, -0.1, -0.03), scale=(0.012, 0.035, 0.012), mat=cn_orange))
# the scope: a tube on two mounts, a cyan lens at the front
C.append(prim('cyl', 'scope', loc=T(0, 0.17, -0.02), scale=(0.034, 0.034, 0.15), rot=ALONG, mat=cn_black, vertices=18))
C.append(prim('cyl', 'scopebell', loc=T(0, 0.17, -0.17), scale=(0.045, 0.045, 0.03), rot=ALONG, mat=cn_black, vertices=18))
C.append(prim('cyl', 'lens', loc=T(0, 0.17, -0.2), scale=(0.038, 0.038, 0.004), rot=ALONG, mat=cn_lens, vertices=18))
C.append(prim('cyl', 'eyepiece', loc=T(0, 0.17, 0.14), scale=(0.03, 0.03, 0.02), rot=ALONG, mat=cn_black, vertices=16))
for z in (-0.08, 0.06):
    C.append(prim('cube', 'mount', loc=T(0, 0.125, z), scale=(0.018, 0.03, 0.016), mat=cn_black))
# the pressure gauge on three's +x side of the chamber: a white face, a chrome rim, a red needle
SIDE = (0, math.pi / 2, 0)   # (a disc facing three's +x)
C.append(prim('cyl', 'gaugeface', loc=(0.137, -0.17, 0.0), scale=(0.045, 0.045, 0.01), rot=SIDE, mat=cn_white, vertices=20))
C.append(prim('torus', 'gaugerim', loc=(0.139, -0.17, 0.0), scale=(0.046, 0.046, 0.046), rot=SIDE, mat=cn_chrome, major_radius=1, minor_radius=0.12, major_segments=20, minor_segments=5))
C.append(prim('cube', 'needle', loc=(0.149, -0.17, 0.01), scale=(0.002, 0.004, 0.03), rot=(0.6, 0, 0), mat=cn_red))
# the hose's port at the back
C.append(prim('torus', 'port', loc=T(0, 0, 0.45), scale=(0.045, 0.045, 0.045), rot=ALONG, mat=cn_chrome, major_radius=1, minor_radius=0.3, major_segments=18, minor_segments=6))
cannon = join(C, 'cannon')
pivot(cannon, (0, 0, 0))
parts.append(cannon)
# --- the tank on his back (in the torso's frame: its middle a little behind his back, between the shoulders): a
# clear shell (teal domes at its ends, black bands), a black frame against his back, straps over his shoulders, a
# chrome cap; the water inside is its own part (the game lowers it as he fires)
TX, TY = -0.2, 0.42
K = [prim('cyl', 'tankshell', loc=T(TX, TY, 0), scale=(0.13, 0.13, 0.2), mat=cn_glass, vertices=28)]
for dy in (-0.2, 0.2):
    K.append(prim('sphere', 'tankend', loc=T(TX, TY + dy, 0), scale=(0.131, 0.131, 0.065), mat=cn_teal, segments=24, ring_count=10))
for dy in (-0.12, 0.0, 0.12):
    K.append(prim('torus', 'tankband', loc=T(TX, TY + dy, 0), scale=(0.134, 0.134, 0.134), mat=cn_black, major_radius=1, minor_radius=0.05, major_segments=28, minor_segments=5))
K.append(prim('cyl', 'cap', loc=T(TX, TY + 0.28, 0), scale=(0.04, 0.04, 0.025), mat=cn_chrome, vertices=16))
K.append(prim('cube', 'frame', loc=T(TX + 0.13, TY, 0), scale=(0.02, 0.2, 0.11), mat=cn_black))
for s in (-1, 1):
    K.append(prim('torus', 'strap', loc=T(-0.06, 0.5, s * 0.12), scale=(0.15, 0.15, 0.15), rot=ALONG, mat=cn_black, major_radius=1, minor_radius=0.09, major_segments=20, minor_segments=4))
tank = join(K, 'tank')
pivot(tank, (0, 0, 0))
parts.append(tank)
# (its pivot at its bottom: the game scales it down to the water that's left)
tw = prim('cyl', 'tankwater', loc=T(TX, TY, 0), scale=(0.12, 0.12, 0.19), mat=cn_water, vertices=24)
pivot(tw, T(TX, TY - 0.19, 0))
parts.append(tw)
# the bases baked into one texture set: denim weave on the jeans, a fabric grain on the vest and shirt, scuffed
# leather, warm skin, a glossy board; soft shadows in every fold; the weave and grain in the normal map
detail(jeans, 'stripes', scale=160, mix=0.22, color2='#3a5280')
detail(vest, 'noise', scale=60, mix=0.12, color2='#e65a08')
detail(shirt, 'noise', scale=50, mix=0.15)
detail(boot, 'noise', scale=14, mix=0.3, color2='#3c2614')
detail(skin, 'noise', scale=20, mix=0.08)
objs = [b for _, b, _ in BASE]
highs = [high_copy(b, 1, {'kind': 'STUCCI', 'scale': 0.004, 'strength': 0.003}) if n in ('thigh', 'shin', 'torso', 'upperarm', 'pelvis') else None for n, b, _ in BASE]
bake_set(objs, 'builder', size=512, highs=highs)
for n, b, det in BASE:
    o = join([b] + det, n) if det else b
    o.name = n
    pivot(o, (0, 0, 0))
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'builder.glb')))
