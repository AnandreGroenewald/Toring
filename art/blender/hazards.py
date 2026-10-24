# (1.20) What the endless river adds further down (the owner, 25 Oct 2026: "after 1000 meters it adds a clown that tries
# to distract you, after 2000 meters there is a small object that you need to jump over"):
#   - Hanswors (Stapel's clown, 🤡) sitting backwards on a big yellow inflatable duck, three balloons tied to its tail,
#     a cream pie in his raised hand: parts 'duck' (the float, its own bob), 'clown' (body, legs, collar, shoes),
#     'clownhead' (origin on the neck), 'clownarm' (the throwing arm, origin on the shoulder), 'balloons', 'pie' (the
#     one he throws: the game copies it)
#   - logs to jump: 'log' (one lane, 2.9 m) and 'longlog' (across the river, 10.6 m): bark, cut ends with rings, moss
#   - 'tree': a fallen tree across the river at head height (duck under it): the trunk bank to bank, its root plate on
#     one bank, its leafy crown on the other
# Blender's (x, y, z) = three's (x, -z, y): +x across the river, +y down it (away from you), +z up. The waterline is z 0.
# usage: Blender -b -P art/blender/hazards.py -- img/models/hazards.glb
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, skin_body, apply, prim, join, pivot, export, bake_set, high_copy, eye, gradient, palettize, detail, bands
import bpy
import bmesh

reset()
random.seed(7)

# ------------------------------------------------------------------------------------------------ Hanswors on his duck
duckY = material('h_duck', '#ffd21f', rough=0.18)
gradient(duckY, '#ffe14d', '#f5b400', 0.1, 1.1)
beak = material('h_beak', '#ff7a1a', rough=0.22)
white = material('h_white', '#fbfbf7', rough=0.35)
suit = material('h_suit', '#22b8d6', rough=0.5)
gradient(suit, '#3fd0ea', '#1592b3', 0.4, 1.5)
red = material('h_red', '#e8262d', rough=0.25)
blue = material('h_blue', '#2f7df0', rough=0.3)
green = material('h_green', '#36c25a', rough=0.3)
yellow = material('h_yellow', '#ffd23a', rough=0.3)
purple = material('h_purple', '#8e5cf0', rough=0.3)
orange = material('h_orange', '#ff8a1f', rough=0.5)
shoe = material('h_shoe', '#d81f2a', rough=0.2)
black = material('h_black', '#141414', rough=0.3)
skinC = material('h_skin', '#ffe9dc', rough=0.45)
tin = material('h_tin', '#c9ced6', rough=0.25, metal=0.8)
cream = material('h_cream', '#fffaf0', rough=0.5)
string = material('h_string', '#f2f2f2', rough=0.6)

# the duck float: a plump body along the river (its head at +y, the way it goes), a tail up behind, a beak
D = [(0, -1.0, 0.25, 0.55, 0.42), (0, -0.4, 0.3, 0.85, 0.5), (0, 0.3, 0.3, 0.82, 0.48), (0, 0.85, 0.32, 0.55, 0.42)]
duck = apply(skin_body('duck', D, [(0, 1), (1, 2), (2, 3)], smooth=2), tris=2400)
duck.data.materials.append(duckY)
# (a rubber duck's head: a big round ball on a slim neck, so it reads as a duck from any side)
neck = apply(skin_body('ducknk', [(0, 0.82, 0.5, 0.38, 0.36), (0, 0.96, 1.0, 0.26, 0.26)], [(0, 1)], smooth=2), tris=900)
neck.data.materials.append(duckY)
tail = apply(skin_body('ducktl', [(0, -1.05, 0.4, 0.3, 0.3), (0, -1.35, 0.78, 0.14, 0.14)], [(0, 1)], smooth=2), tris=500)
tail.data.materials.append(duckY)
dhead = prim('sphere', 'dhead', loc=(0, 1.0, 1.32), scale=(0.47, 0.47, 0.45), mat=duckY, segments=28, ring_count=16)
duckBody = join([duck, neck, tail, dhead], 'duck')
bake_set([duckBody], 'duck', size=512, highs=[None], ao_dist=0.4, ao_k=0.45)
DD = []
DD.append(prim('sphere', 'beakU', loc=(0, 1.5, 1.27), scale=(0.21, 0.24, 0.075), mat=beak, segments=16, ring_count=8))
DD.append(prim('sphere', 'beakL', loc=(0, 1.45, 1.19), scale=(0.17, 0.19, 0.05), mat=beak, segments=16, ring_count=8))
for s in (1, -1):
    DD += eye(f'deye{s}', (s * 0.2, 1.33, 1.5), 0.1, (s * 0.55, 1.0, 0.2), iris='#1d1d1d', pupil='round', lid=0.0, iris_k=0.75)
    # (the duck's wings: flat ovals on its sides)
    DD.append(prim('sphere', 'wing', loc=(s * 0.78, 0.0, 0.42), scale=(0.12, 0.5, 0.22), rot=(0.25, 0, 0), mat=duckY, segments=16, ring_count=8))
palettize(DD, 'duckdet', rough=0.25)
duckP = join([duckBody] + DD, 'duck')

# Hanswors, sitting backwards on its back (facing you: Blender -y), legs dangling over its sides
seatZ = 0.78
B = [(0, -0.15, seatZ + 0.05, 0.3, 0.26), (0, -0.15, seatZ + 0.42, 0.28, 0.24), (0, -0.15, seatZ + 0.66, 0.16, 0.15)]
E = [(0, 1), (1, 2)]
for s in (1, -1):
    b = len(B)
    B += [(s * 0.17, -0.25, seatZ, 0.12, 0.12), (s * 0.3, -0.55, seatZ - 0.05, 0.1, 0.1), (s * 0.35, -0.7, seatZ - 0.42, 0.09, 0.09)]
    E += [(0, b), (b, b + 1), (b + 1, b + 2)]
# the other arm, resting on the duck
b = len(B)
B += [(-0.3, -0.15, seatZ + 0.55, 0.08, 0.08), (-0.42, -0.25, seatZ + 0.25, 0.07, 0.07)]
E += [(2, b), (b, b + 1)]
cl = apply(skin_body('clown', B, E, smooth=2), tris=2200)
cl.data.materials.append(suit)
bake_set([cl], 'clown', size=512, highs=[None], ao_dist=0.18, ao_k=0.3)
C = []
# polka dots on the suit (on its surface: placed by casting onto the body)
from mathutils import Vector
dots = [red, yellow, white, green, purple]
for k in range(34):
    a = random.uniform(0, math.pi * 2)
    zz = random.uniform(seatZ - 0.0, seatZ + 0.58)
    o = Vector((0, -0.15, zz))
    d = Vector((math.cos(a), math.sin(a), 0))
    ok, loc, nrm, _ = cl.ray_cast(o + d * 0.6, -d)
    if ok and abs(nrm.z) < 0.8:
        # (a flat round spot lying on the cloth)
        dt = prim('sphere', 'dot', loc=(0, 0, 0), scale=(0.042, 0.042, 0.009), mat=dots[k % len(dots)], segments=8, ring_count=4)
        dt.rotation_mode = 'QUATERNION'
        dt.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(nrm)
        bpy.ops.object.select_all(action='DESELECT')
        dt.select_set(True)
        bpy.context.view_layer.objects.active = dt
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        dt.location = tuple(loc + nrm * 0.002)
        C.append(dt)
# the ruff collar: a wavy ring round the neck
bpy.ops.mesh.primitive_torus_add(major_radius=0.2, minor_radius=0.07, major_segments=40, minor_segments=8, location=(0, -0.15, seatZ + 0.68))
ruff = bpy.context.active_object
for v in ruff.data.vertices:
    a = math.atan2(v.co.y, v.co.x)
    v.co.z += math.sin(a * 10) * 0.03
ruff.data.materials.append(white)
C.append(ruff)
for k in range(3):
    C.append(prim('sphere', 'pompom', loc=(0, -0.45, seatZ + 0.5 - k * 0.17), scale=(0.05, 0.05, 0.05), mat=[red, blue, green][k], segments=10, ring_count=6))
# the big shoes and the gloves
for s in (1, -1):
    C.append(prim('sphere', 'shoe', loc=(s * 0.36, -0.82, seatZ - 0.5), scale=(0.13, 0.22, 0.1), mat=shoe, segments=16, ring_count=10))
C.append(prim('sphere', 'glove', loc=(-0.43, -0.3, seatZ + 0.18), scale=(0.08, 0.08, 0.08), mat=white, segments=12, ring_count=8))
palettize(C, 'clowndet', rough=0.35)
clownP = join([cl] + C, 'clown')

# the head: a round white face, a red glossy nose, big blue eyes, a wide red smile, orange curly hair puffs, a tiny hat
neckZ = seatZ + 0.72
H = [prim('sphere', 'face', loc=(0, -0.15, neckZ + 0.24), scale=(0.24, 0.23, 0.25), mat=skinC, segments=28, ring_count=16)]
H.append(prim('sphere', 'nose', loc=(0, -0.39, neckZ + 0.22), scale=(0.07, 0.07, 0.07), mat=red, segments=16, ring_count=10))
for s in (1, -1):
    H += eye(f'ceye{s}', (s * 0.085, -0.33, neckZ + 0.31), 0.055, (s * 0.15, -1.0, 0.05), iris='#2f7df0', pupil='round', lid=0.05, lid_mat=skinC, iris_k=0.7)
    # the white face paint round the eyes (an upward arch) and the eyebrows high up
    H.append(prim('sphere', 'brow', loc=(s * 0.09, -0.34, neckZ + 0.4), scale=(0.05, 0.015, 0.012), rot=(0, s * 0.35, 0), mat=black, segments=8, ring_count=6))
    # hair: three orange puffs on each side
    for k in range(3):
        H.append(prim('sphere', 'hair', loc=(s * (0.22 + 0.05 * k), -0.1 + k * 0.08, neckZ + 0.36 - k * 0.09), scale=(0.11, 0.11, 0.11), mat=orange, segments=12, ring_count=8))
# the smile: a red curve with the white face round it
bpy.ops.mesh.primitive_torus_add(major_radius=0.11, minor_radius=0.025, major_segments=24, minor_segments=6, location=(0, -0.36, neckZ + 0.17))
sm = bpy.context.active_object
bm = bmesh.new()
bm.from_mesh(sm.data)
bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.y > -0.02], context='VERTS')
bm.to_mesh(sm.data)
bm.free()
sm.rotation_euler = (math.pi / 2, 0, 0)
sm.data.materials.append(red)
H.append(sm)
# the tiny hat: a little purple top hat, tilted
H.append(prim('cyl', 'hatbrim', loc=(0.04, -0.12, neckZ + 0.47), scale=(0.13, 0.13, 0.012), rot=(0, 0.25, 0), mat=purple, vertices=20))
H.append(prim('cyl', 'hattop', loc=(0.06, -0.12, neckZ + 0.56), scale=(0.08, 0.08, 0.09), rot=(0, 0.25, 0), mat=purple, vertices=20))
H.append(prim('cyl', 'hatband', loc=(0.055, -0.12, neckZ + 0.5), scale=(0.082, 0.082, 0.02), rot=(0, 0.25, 0), mat=yellow, vertices=20))
palettize(H, 'clownhead', rough=0.35)
headP = join(H, 'clownhead')
pivot(headP, (0, -0.15, neckZ))

# the throwing arm: shoulder to the raised hand, holding a pie over his head
A = apply(skin_body('clownarm', [(0.3, -0.15, seatZ + 0.55, 0.08, 0.08), (0.42, -0.2, seatZ + 0.85, 0.07, 0.07), (0.42, -0.25, seatZ + 1.12, 0.065, 0.065)], [(0, 1), (1, 2)], smooth=2), tris=500)
A.data.materials.append(suit)
AA = [A, prim('sphere', 'gloveR', loc=(0.42, -0.26, seatZ + 1.18), scale=(0.08, 0.08, 0.08), mat=white, segments=12, ring_count=8)]
for k in range(4):
    AA.append(prim('sphere', 'adot', loc=(0.3 + 0.04 * k, -0.24, seatZ + 0.6 + 0.15 * k), scale=(0.03, 0.03, 0.03), mat=dots[k], segments=8, ring_count=6))
palettize(AA, 'clownarm', rough=0.4)
armP = join(AA, 'clownarm')
pivot(armP, (0.3, -0.15, seatZ + 0.55))

def pie(name, at):
    x, y, z = at
    P_ = [prim('cyl', 'tin', loc=(x, y, z), scale=(0.17, 0.17, 0.035), mat=tin, vertices=24)]
    bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.02, major_segments=36, minor_segments=5, location=(x, y, z + 0.035))
    rim = bpy.context.active_object
    for v in rim.data.vertices:
        a = math.atan2(v.co.y, v.co.x)
        v.co.z += math.sin(a * 18) * 0.008
    rim.data.materials.append(tin)
    P_.append(rim)
    cr = prim('sphere', 'cream', loc=(x, y, z + 0.06), scale=(0.16, 0.16, 0.08), mat=cream, segments=20, ring_count=10)
    for v in cr.data.vertices:
        a = math.atan2(v.co.y - y, v.co.x - x)
        v.co.z += max(0, v.co.z - (z + 0.06)) * math.sin(a * 7) * 0.25
    P_.append(cr)
    P_.append(prim('sphere', 'cherry', loc=(x, y, z + 0.15), scale=(0.035, 0.035, 0.035), mat=red, segments=12, ring_count=8))
    palettize(P_, name, rough=0.3)
    o = join(P_, name)
    pivot(o, at)
    return o

pieP = pie('pie', (0.42, -0.25, seatZ + 1.27))

# three balloons on strings tied to the duck's tail
BL = []
for k, (col, dx, dz) in enumerate(((red, -0.25, 2.3), (blue, 0.05, 2.55), (yellow, 0.3, 2.2))):
    BL.append(prim('sphere', 'balloon', loc=(dx, -1.45, dz), scale=(0.2, 0.2, 0.25), mat=col, segments=20, ring_count=12))
    BL.append(prim('cone', 'knot', loc=(dx, -1.45, dz - 0.27), scale=(0.035, 0.035, 0.04), mat=col, vertices=8, radius1=1, depth=1))
    n = 6
    for i in range(n):
        f0 = i / n
        f1 = (i + 1) / n
        p0 = Vector((0, -1.35, 0.8)).lerp(Vector((dx, -1.45, dz - 0.3)), f0)
        p1 = Vector((0, -1.35, 0.8)).lerp(Vector((dx, -1.45, dz - 0.3)), f1)
        p0.x += math.sin(f0 * 6 + k) * 0.04
        p1.x += math.sin(f1 * 6 + k) * 0.04
        mid = (p0 + p1) / 2
        d = p1 - p0
        c = prim('cyl', 'string', loc=tuple(mid), scale=(0.006, 0.006, d.length / 2), mat=string, vertices=5)
        c.rotation_mode = 'QUATERNION'
        c.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
        bpy.ops.object.select_all(action='DESELECT')
        c.select_set(True)
        bpy.context.view_layer.objects.active = c
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        BL.append(c)
palettize(BL, 'balloons', rough=0.25)
balloonsP = join(BL, 'balloons')
pivot(balloonsP, (0, -1.35, 0.8))

# ------------------------------------------------------------------------------------------------ the logs
bark = material('h_bark', '#6b4a2e', rough=0.85)
bands(bark, scale=14, mix=0.35, color2='#3d2918', axis='Y', distort=8)
woodEnd = material('h_woodend', '#d9b27c', rough=0.7)
ring = material('h_ring', '#a8784a', rough=0.7)
moss = material('h_moss', '#5f8f2a', rough=0.8)

def logMesh(name, length, r, seed):
    rnd = random.Random(seed)
    n = 8
    pts = []
    for i in range(n + 1):
        f = i / n
        x = -length / 2 + f * length
        pts.append((x, math.sin(f * 3.1 + seed) * 0.06, r * (1 + math.sin(f * 7 + seed) * 0.05), r * (0.97 + rnd.random() * 0.06), r * (0.97 + rnd.random() * 0.06)))
    o = apply(skin_body(name, [(p[0], p[1], p[2], p[3], p[4]) for p in pts], [(i, i + 1) for i in range(n)], smooth=2, displace={'kind': 'CLOUDS', 'scale': 0.15, 'strength': 0.03}), tris=1100 if length < 4 else 1900)
    # (cut flat at both ends)
    for v in o.data.vertices:
        if v.co.x < -length / 2 + 0.02:
            v.co.x = -length / 2
        if v.co.x > length / 2 - 0.02:
            v.co.x = length / 2
    o.data.materials.append(bark)
    return o

logs = {}
for nm, L, r, sd in (('log', 2.9, 0.33, 1), ('longlog', 10.6, 0.36, 2)):
    logs[nm] = logMesh(nm, L, r, sd)
bake_set(list(logs.values()), 'logs', size=512, highs=[high_copy(o, 1, {'kind': 'STUCCI', 'scale': 0.03, 'strength': 0.025}) for o in logs.values()], ao_dist=0.3, ao_k=0.4)
for nm, L, r, sd in (('log', 2.9, 0.33, 1), ('longlog', 10.6, 0.36, 2)):
    det = []
    for s in (-1, 1):
        x = s * L / 2
        det.append(prim('cyl', 'endcap', loc=(x + s * 0.005, math.sin((0.5 + 0.5 * s) * 3.1 + sd) * 0.06, r), scale=(r * 0.93, r * 0.93, 0.01), rot=(0, math.pi / 2, 0), mat=woodEnd, vertices=24))
        for k, rr in enumerate((0.35, 0.6, 0.82)):
            det.append(prim('torus', 'yearring', loc=(x + s * 0.012, math.sin((0.5 + 0.5 * s) * 3.1 + sd) * 0.06, r), scale=(r * rr, r * rr, r * rr), rot=(0, math.pi / 2, 0), mat=ring, major_radius=1, minor_radius=0.03, major_segments=18, minor_segments=3))
    # moss patches on top, a broken branch stub
    for k in range(max(2, int(L * 1.2))):
        det.append(prim('sphere', 'moss', loc=(random.uniform(-L / 2 + 0.3, L / 2 - 0.3), random.uniform(-0.12, 0.12), 2 * r * 0.97), scale=(random.uniform(0.12, 0.3), random.uniform(0.08, 0.16), 0.04), mat=moss, segments=8, ring_count=4))
    det.append(prim('cone', 'stub', loc=(L * 0.18, -0.12, r * 1.75), scale=(0.07, 0.07, 0.22), rot=(0.6, 0.3, 0), mat=bark, vertices=8, radius1=1, radius2=0.5, depth=2))
    palettize(det, f'{nm}det', rough=0.7)
    o = join([logs[nm]] + det, nm)
    pivot(o, (0, 0, 0))

# ------------------------------------------------------------------------------------------------ the fallen tree
# a thick dead trunk fallen across the canyon, wedged between its walls (its underside 1.5 m over the water at the
# middle): grey-brown bark, broken stubs, moss on top with a few green sprouts, moss strands hanging a little; its root
# plate at the -x end against the rock
TL = 18.0
under = 1.5
r0, r1 = 0.6, 0.44
TP = []
for i in range(13):
    f = i / 12
    x = -TL / 2 + f * TL
    rr = r0 + (r1 - r0) * f
    sag = -math.sin(f * math.pi) * 0.1
    TP.append((x, math.sin(f * 2.3) * 0.12, under + rr + sag + f * 0.2, rr, rr * 0.94))
trunk = apply(skin_body('tree', TP, [(i, i + 1) for i in range(12)], smooth=2, displace={'kind': 'CLOUDS', 'scale': 0.25, 'strength': 0.05}), tris=2800)
deadBark = material('h_deadbark', '#7a6450', rough=0.9)
bands(deadBark, scale=10, mix=0.4, color2='#4a3a2c', axis='Y', distort=9)
trunk.data.materials.append(deadBark)
bake_set([trunk], 'tree', size=1024, highs=[high_copy(trunk, 1, {'kind': 'STUCCI', 'scale': 0.04, 'strength': 0.035})], ao_dist=0.45, ao_k=0.45)
TD = []
leafA = material('h_leafA', '#4f8a2a', rough=0.75)
leafB = material('h_leafB', '#78a83a', rough=0.75)
earth = material('h_earth', '#4a3020', rough=0.95)
rootM = material('h_root', '#5e4632', rough=0.9)
mossD = material('h_mossd', '#4d7a26', rough=0.85)
def topAt(f):
    rr = r0 + (r1 - r0) * f
    return under + 2 * rr - math.sin(f * math.pi) * 0.1 + f * 0.2
# broken stubs: short and thick, angled up and sideways (never down into the gap)
for f, ang, ln in ((0.22, 0.9, 0.55), (0.41, -1.1, 0.7), (0.58, 0.5, 0.45), (0.77, -0.6, 0.6)):
    x = -TL / 2 + f * TL
    rr = r0 + (r1 - r0) * f
    TD.append(prim('cone', 'stub', loc=(x, math.sin(ang) * rr * 0.6, topAt(f) - rr * 0.35 + ln * 0.35), scale=(rr * 0.32, rr * 0.32, ln * 0.5), rot=(ang * 0.6, 0.25, 0), mat=deadBark, vertices=10, radius1=1, radius2=0.55, depth=2))
# moss patches along the top, a few green sprouts in them
for k in range(16):
    f = random.uniform(0.08, 0.92)
    x = -TL / 2 + f * TL
    TD.append(prim('sphere', 'tmoss', loc=(x, random.uniform(-0.12, 0.12), topAt(f) - 0.05), scale=(random.uniform(0.25, 0.5), random.uniform(0.18, 0.3), 0.07), mat=random.choice([moss, mossD]), segments=8, ring_count=5))
for k in range(7):
    f = random.uniform(0.15, 0.85)
    x = -TL / 2 + f * TL
    for j in range(3):
        a = j / 3 * math.pi * 2 + k
        TD.append(prim('sphere', 'sprout', loc=(x + math.cos(a) * 0.12, math.sin(a) * 0.12, topAt(f) + 0.12), scale=(0.1, 0.04, 0.16), rot=(math.cos(a) * 0.5, math.sin(a) * 0.5, a), mat=random.choice([leafA, leafB]), segments=8, ring_count=4))
# moss strands hanging under it (short: well above you as you duck)
for k in range(12):
    f = 0.1 + k * 0.07
    x = -TL / 2 + f * TL
    ln = random.uniform(0.12, 0.25)
    TD.append(prim('cone', 'strand', loc=(x, random.uniform(-0.2, 0.2), under - ln * 0.5 + 0.05), scale=(0.035, 0.035, ln * 0.5), rot=(math.pi, 0, 0), mat=mossD, vertices=6, radius1=1, depth=2))
# the root plate at the -x end: a ragged disc of earth with roots fanning out
TD.append(prim('cyl', 'rootplate', loc=(-TL / 2 - 0.15, 0, under + r0), scale=(1.4, 1.4, 0.3), rot=(0, math.pi / 2, 0), mat=earth, vertices=18))
for k in range(11):
    a = k / 11 * math.pi * 2
    TD.append(prim('cone', 'root', loc=(-TL / 2 - 0.3, math.cos(a) * 1.15, under + r0 + math.sin(a) * 1.15), scale=(0.1, 0.1, 0.55), rot=(0, math.pi / 2 + 0.25, a), mat=rootM, vertices=7, radius1=1, depth=1))
# the broken top at the +x end: a jagged cap
for k in range(6):
    a = k / 6 * math.pi * 2
    TD.append(prim('cone', 'splinter', loc=(TL / 2 + 0.1, math.cos(a) * r1 * 0.6, topAt(1.0) - r1 + math.sin(a) * r1 * 0.6), scale=(0.08, 0.08, 0.3), rot=(0, math.pi / 2, a), mat=deadBark, vertices=5, radius1=1, depth=1))
palettize(TD, 'treedet', rough=0.8)
treeP = join([trunk] + TD, 'tree')
pivot(treeP, (0, 0, 0))

export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'hazards.glb')))
