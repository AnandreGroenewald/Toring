# (1.20) The river's small things: the life ring the rescued people float in (red and white, a rope round it), the
# swimmer in it (a shirt the game colours per person; 'swimarm' waves, origin on the shoulder), three river boulders,
# the jetty (planks on beams and posts) and a rowing boat. Each part at the origin; three's up is Blender's z.
# usage: Blender -b -P art/blender/props.py -- img/models/props.glb
import sys, os, math, random
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, skin_body, apply, prim, join, pivot, export, detail, bake_set, high_copy, palettize
import bpy

reset()
random.seed(11)
red = material('p_red', '#e8341f', rough=0.25)
white = material('p_white', '#f7f4ee', rough=0.25)
rope = material('p_rope', '#efe1bd', rough=0.7)
vest = material('p_vest', '#ff6a10', rough=0.45)
strap = material('p_strap', '#f4f4f4', rough=0.5)
buckle = material('p_buckle', '#1c1f24', rough=0.4)
silverp = material('p_silver', '#dfe6ec', rough=0.25, metal=0.4, emit='#9aa3aa', emit_k=0.2)
shirt = material('swim_shirt', '#2f6db5', rough=0.7)
skin = material('p_skin', '#c99773', rough=0.6)
rockm = material('p_rock', '#a98564', rough=0.9)
wood = material('p_wood', '#8a5d3b', rough=0.75)
woodDark = material('p_wooddark', '#5e3e26', rough=0.8)
boatWhite = material('p_boat', '#f2efe8', rough=0.45)
boatBlue = material('p_boatblue', '#2f6fae', rough=0.45)
boatWood = material('p_boatwood', '#9a6a40', rough=0.7)
boatDeck = material('p_boatdeck', '#6e4a2c', rough=0.8)

# --- the life ring: four red and four white segments, a rope looped round it
R = []
for i in range(8):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.62, minor_radius=0.2, major_segments=48, minor_segments=14)
    o = bpy.context.active_object
    # (a segment: keep the faces within its eighth of the ring)
    import bmesh
    bm = bmesh.new()
    bm.from_mesh(o.data)
    a0 = i / 8 * math.pi * 2
    a1 = (i + 1) / 8 * math.pi * 2
    kill = [f for f in bm.faces if not (a0 <= (math.atan2(f.calc_center_median().y, f.calc_center_median().x) % (math.pi * 2)) < a1)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.append(red if i % 2 == 0 else white)
    for p in o.data.polygons:
        p.use_smooth = True
    R.append(o)
ring = join(R, 'ring')
bpy.ops.object.select_all(action='DESELECT')
ring.select_set(True)
bpy.context.view_layer.objects.active = ring
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.mesh.remove_doubles(threshold=0.001)
bpy.ops.object.mode_set(mode='OBJECT')
ropes = [prim('torus', 'rope', loc=(0, 0, 0.02), scale=(1, 1, 1), mat=rope, major_radius=0.84, minor_radius=0.032, major_segments=64, minor_segments=6)]
for i in range(4):
    a = (i + 0.5) / 4 * math.pi * 2
    ropes.append(prim('torus', 'loop', loc=(math.cos(a) * 0.62, math.sin(a) * 0.62, 0), scale=(1, 1, 1), rot=(math.pi / 2, 0, a + math.pi / 2), mat=rope, major_radius=0.225, minor_radius=0.03, major_segments=18, minor_segments=5))
palettize([ring] + ropes, 'ring', rough=0.28)
ring = join([ring] + ropes, 'ring')

# --- the swimmer: a chunky body in a shirt (the game colours it per person) under an orange life vest with white
# straps, a buckle and a collar; the other arm resting on the ring, a mitten hand
sw = apply(skin_body('swimmer', [(0, 0, 0.0, 0.23, 0.2), (0, 0, 0.3, 0.27, 0.21), (0, 0, 0.55, 0.26, 0.19), (0, 0, 0.7, 0.085, 0.085)], [(0, 1), (1, 2), (2, 3)], smooth=2), tris=800)
sw.data.materials.append(shirt)

def shell(src, name, z0, z1, push, mat, thick=0.012):
    """A layer over `src` between heights z0..z1, pushed out by `push` along the surface (a vest, a strap that fits)."""
    import bmesh
    o = src.copy()
    o.data = src.data.copy()
    bpy.context.collection.objects.link(o)
    o.name = name
    bm = bmesh.new()
    bm.from_mesh(o.data)
    bm.normal_update()
    kill = [f for f in bm.faces if not (z0 <= f.calc_center_median().z <= z1)]
    bmesh.ops.delete(bm, geom=kill, context='FACES')
    bm.normal_update()
    for v in bm.verts:
        v.co += v.normal * push
    bm.to_mesh(o.data)
    bm.free()
    o.data.materials.clear()
    o.data.materials.append(mat)
    s = o.modifiers.new('Thick', 'SOLIDIFY')
    s.thickness = thick
    s.offset = 1
    return apply(o)

V = [shell(sw, 'vest', 0.04, 0.6, 0.035, vest, 0.02)]
for z0, z1 in ((0.17, 0.235), (0.35, 0.415)):
    V.append(shell(sw, 'strap', z0, z1, 0.058, strap, 0.012))
    zc = (z0 + z1) / 2
    V.append(prim('cube', 'buckle', loc=(0, -0.3, zc), scale=(0.045, 0.014, 0.03), mat=buckle))
V.append(shell(sw, 'reflect', 0.465, 0.505, 0.056, silverp, 0.01))
V.append(prim('torus', 'collar', loc=(0, 0, 0.6), scale=(0.15, 0.13, 0.09), mat=vest, major_radius=1, minor_radius=0.45, major_segments=24, minor_segments=8))
rest = apply(skin_body('rest', [(-0.22, 0, 0.52, 0.075, 0.075), (-0.42, -0.06, 0.32, 0.068, 0.068), (-0.56, -0.06, 0.22, 0.062, 0.062)], [(0, 1), (1, 2)], smooth=2), tris=260)
rest.data.materials.append(skin)
mitt = prim('sphere', 'mitt', loc=(-0.6, -0.07, 0.2), scale=(0.075, 0.06, 0.06), mat=skin, segments=12, ring_count=8)
neck = prim('cyl', 'neck', loc=(0, 0, 0.74), scale=(0.07, 0.07, 0.06), mat=skin, vertices=12)
# (the shirt keeps its own material: the game colours it per person; the rest in one palette)
palettize(V + [rest, mitt, neck], 'swimmer', rough=0.45)
swimmer = join([sw] + V + [rest, mitt, neck], 'swimmer')
# --- the waving arm (its origin on the shoulder; the game swings it): a sleeve of the vest's colour, a mitten hand
arm = apply(skin_body('swimarm', [(0.22, 0, 0.56, 0.08, 0.08), (0.33, 0, 0.82, 0.068, 0.068), (0.37, 0, 1.04, 0.062, 0.062)], [(0, 1), (1, 2)], smooth=2), tris=300)
arm.data.materials.append(skin)
hand = prim('sphere', 'hand', loc=(0.38, 0, 1.12), scale=(0.075, 0.05, 0.085), mat=skin, segments=12, ring_count=8)
thumb = prim('sphere', 'thumb', loc=(0.33, -0.02, 1.09), scale=(0.03, 0.03, 0.045), rot=(0, 0.5, 0), mat=skin, segments=8, ring_count=6)
palettize([arm, hand, thumb], 'swimarm', rough=0.55)
swimarm = join([arm, hand, thumb], 'swimarm')
pivot(swimarm, (0.22, 0, 0.56))

# --- three river boulders: lumpy, flat-bottomed, in the canyon's sandstone
boulders = []
for k in range(3):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=3, radius=1)
    o = bpy.context.active_object
    o.name = f'boulder{k + 1}'
    tex = bpy.data.textures.new(f'b{k}', 'CLOUDS')
    tex.noise_scale = 0.6
    d = o.modifiers.new('Displace', 'DISPLACE')
    d.texture = tex
    d.strength = 0.35
    o.scale = (1.5 + k * 0.2, 1.3 - k * 0.1, 1.0 + k * 0.15)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o = apply(o, tris=900)
    for v in o.data.vertices:
        if v.co.z < -0.35:
            v.co.z = -0.35 + (v.co.z + 0.35) * 0.2
    o.data.materials.append(rockm)
    boulders.append(o)

# --- the jetty: planks across two beams, posts into the water
J = []
for i in range(14):
    J.append(prim('cube', 'plank', loc=(0, -7.6 + i * 1.17, 1.4), scale=(1.55, 0.52, 0.06), rot=(0, random.uniform(-0.02, 0.02), random.uniform(-0.03, 0.03)), mat=wood))
for x in (-1.2, 1.2):
    J.append(prim('cube', 'beam', loc=(x, 0, 1.25), scale=(0.1, 8.2, 0.1), mat=woodDark))
    for y in (-7.5, -2.5, 2.5, 7.5):
        J.append(prim('cyl', 'post', loc=(x * 1.08, y, 0.4), scale=(0.15, 0.15, 1.6), mat=woodDark, vertices=8))
jetty = join(J, 'jetty')

# --- the rowing boat: a hull (white, a blue stripe), two thwarts, oars
hull = apply(skin_body('boat', [(0, -1.9, 0.35, 0.18, 0.12), (0, -1.1, 0.25, 0.62, 0.3), (0, 0.2, 0.22, 0.78, 0.33), (0, 1.5, 0.3, 0.55, 0.3), (0, 2.0, 0.42, 0.2, 0.15)], [(0, 1), (1, 2), (2, 3), (3, 4)], smooth=2), tris=900)
# (hollow it: cut the top off and push the inside down)
for v in hull.data.vertices:
    if v.co.z > 0.42:
        v.co.z = 0.42
hull.data.materials.append(boatWhite)
hull.data.materials.append(boatBlue)
hull.data.materials.append(boatDeck)
for p in hull.data.polygons:
    c = p.center
    # (the top a wooden deck; a blue band round the sides)
    p.material_index = 2 if (c.z > 0.4 and p.normal.z > 0.7) else 1 if 0.26 < c.z < 0.34 else 0
B = [hull]
for y in (-0.5, 0.6):
    B.append(prim('cube', 'thwart', loc=(0, y, 0.47), scale=(0.5, 0.1, 0.03), mat=boatWood))
for s in (1, -1):
    B.append(prim('cyl', 'oar', loc=(s * 0.55, 0.1, 0.5), scale=(0.03, 0.03, 1.2), rot=(math.pi / 2, 0, s * 0.18), mat=boatWood, vertices=8))
    B.append(prim('cube', 'blade', loc=(s * (0.55 + 0.2), 1.25, 0.5), scale=(0.08, 0.25, 0.015), rot=(0, 0, s * 0.18), mat=boatWood))
boat = join(B, 'boat')

# the boulders and the jetty baked (stone grain, weathered planks, soft shadows)
detail(rockm, 'stripes', scale=4, mix=0.3, color2='#86603f')
detail(wood, 'stripes', scale=30, mix=0.3, color2='#6b4529')
bake_set(boulders + [jetty], 'props', size=512, highs=[high_copy(b, 1, {'kind': 'CLOUDS', 'scale': 0.15, 'strength': 0.06}) for b in boulders] + [None], ao_dist=0.4, ao_k=0.45)
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'props.glb')))
