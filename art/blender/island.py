# (1.20) Ons dorp's island: a rock island in the lake, sandstone cliffs in layers like the canyon's, a grassy top where
# the Weektoring and the town stand (flat from the middle out to most of its width), a strip of sand at the waterline,
# boulders round its foot. Radius 22 m, the grass at z = 3.3 to 3.6 (the game's ground is 3.6), the foot 2 m under the
# water. Part: 'island'. usage: Blender -b -P art/blender/island.py -- img/models/island.glb
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, apply, prim, join, export, detail, bake_set, high_copy
import bpy, bmesh

reset()
rock = material('i_rock', '#c27a4b', rough=0.9)
grass = material('i_grass', '#7d8f43', rough=0.95)
sand = material('i_sand', '#d9c19a', rough=0.95)
stone = material('i_stone', '#a8835f', rough=0.85)
random.seed(7)

R = 22.0
N = 72
# the profile, from the foot under the water up to the grass: (radius factor, z)
PROFILE = [(1.12, -2.0), (1.1, -0.4), (1.08, 0.05), (1.03, 0.25), (1.0, 0.9), (0.99, 1.6), (0.985, 2.3), (0.97, 3.0), (0.955, 3.3), (0.92, 3.42), (0.6, 3.5), (0.0, 3.52)]
me = bpy.data.meshes.new('island')
bm = bmesh.new()
rings = []
for k, (f, z) in enumerate(PROFILE):
    ring = []
    for i in range(N if f > 0 else 1):
        a = i / N * math.pi * 2
        # (a rough outline: bays and points that change with the height a little)
        n = 1 + 0.07 * math.sin(a * 3 + 1.3) + 0.045 * math.sin(a * 7 + 0.4) + 0.025 * math.sin(a * 13 + z) + random.uniform(-0.01, 0.01)
        r = R * f * n
        # (the layers stick out and are undercut, like the canyon's walls)
        if 0.2 < z < 3.2:
            r += 0.35 * math.sin(z * 4.2 + a * 0.5)
        ring.append(bm.verts.new((r * math.cos(a), r * math.sin(a), z)) if f > 0 else bm.verts.new((0, 0, z)))
    rings.append(ring)
for k in range(len(rings) - 1):
    A, B = rings[k], rings[k + 1]
    for i in range(N):
        if len(B) == 1:
            bm.faces.new((A[i], A[(i + 1) % N], B[0]))
        else:
            bm.faces.new((A[i], A[(i + 1) % N], B[(i + 1) % N], B[i]))
bm.to_mesh(me)
bm.free()
isl = bpy.data.objects.new('island', me)
bpy.context.collection.objects.link(isl)
s = isl.modifiers.new('Subsurf', 'SUBSURF')
s.levels = 1
isl = apply(isl, tris=7000)
for m in (rock, grass, sand):
    isl.data.materials.append(m)
for p in isl.data.polygons:
    c = p.center
    p.material_index = 1 if (c.z > 3.25 and p.normal.z > 0.6) else 2 if (-0.15 < c.z < 0.3) else 0
# boulders round the foot (kept apart: their own colour)
B = []
for i in range(14):
    a = random.uniform(0, math.pi * 2)
    r = R * random.uniform(1.04, 1.12)
    sc = random.uniform(0.7, 1.8)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, location=(r * math.cos(a), r * math.sin(a), random.uniform(-0.2, 0.3)))
    o = bpy.context.active_object
    o.scale = (sc * random.uniform(0.9, 1.4), sc, sc * random.uniform(0.5, 0.8))
    o.rotation_euler = (random.uniform(0, 1), random.uniform(0, 1), random.uniform(0, 3))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.data.materials.append(stone)
    B.append(o)
# the rock in layers, the grass in tufts and patches, wet dark sand; soft shadows; the strata in the normal map too
detail(rock, 'stripes', scale=3.0, mix=0.35, color2='#94512f')
detail(grass, 'noise', scale=10, mix=0.35, color2='#5d7034')
detail(sand, 'noise', scale=18, mix=0.2, color2='#b89a72')
hi = high_copy(isl, 1, {'kind': 'CLOUDS', 'scale': 0.6, 'strength': 0.25})
bake_set([isl], 'island', size=1024, highs=[hi], ao_dist=1.5, ao_k=0.45)
island = join([isl] + B, 'island')
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'island.glb')))
