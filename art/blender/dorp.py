# (1.20) Ons dorp's Karoo town: three kinds of house (a farmhouse with a corrugated-iron roof and a stoep on posts, a
# Cape Dutch house with its curved front gable, a flat-roofed house with a parapet), the NG church with its steeple,
# a windpomp (its rotor turns: part 'rotor', origin on the hub) and a corrugated water tank. Each part stands on z = 0
# at the origin, its front toward Blender -y (three's +z). usage: Blender -b -P art/blender/dorp.py -- img/models/dorp.glb
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from common import reset, out_path, material, apply, prim, join, pivot, export
import bpy, bmesh

reset()
wall = material('d_wall', '#f1ebdf', rough=0.9)
wallWarm = material('d_wallwarm', '#efe2c8', rough=0.9)
plinth = material('d_plinth', '#9b8f80', rough=0.9)
roofRed = material('d_roofred', '#9c3b2a', rough=0.55, metal=0.35)
roofGreen = material('d_roofgreen', '#3f6b4a', rough=0.55, metal=0.35)
roofGrey = material('d_roofgrey', '#7d8790', rough=0.45, metal=0.5)
thatch = material('d_thatch', '#8a6e45', rough=0.95)
shutter = material('d_shutter', '#2f5e44', rough=0.6)
glass = material('d_glass', '#2a3b4a', rough=0.15, metal=0.3)
door = material('d_door', '#6a3d22', rough=0.6)
post = material('d_post', '#e9e4da', rough=0.7)
steel = material('d_steel', '#a9b1b5', rough=0.45, metal=0.35)
dark = material('d_dark', '#3a3a3a', rough=0.6)


def corrugated(name, w, d, ridges, mat, sag=0.035):
    """A sheet of corrugated iron (w across, d down the slope), its ridges along the slope; lying flat on z = 0."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    n = ridges * 4
    rows = []
    for j in range(2):
        row = []
        for i in range(n + 1):
            x = -w / 2 + w * i / n
            z = math.sin(i / n * ridges * math.pi * 2) * sag
            row.append(bm.verts.new((x, -d / 2 + d * j, z)))
        rows.append(row)
    for i in range(n):
        bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    bm.to_mesh(me)
    bm.free()
    o = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(o)
    o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def place(o, loc=(0, 0, 0), rot=(0, 0, 0)):
    o.location = loc
    o.rotation_euler = rot
    for x in bpy.context.view_layer.objects:
        x.select_set(False)
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def window(x, z, front_y, s=1.0, shutters=True):
    """A window on the front wall (front at y = front_y): glass, a white frame, green shutters."""
    out = [prim('cube', 'glass', loc=(x, front_y - 0.01, z), scale=(0.28 * s, 0.02, 0.38 * s), mat=glass),
           prim('cube', 'frame', loc=(x, front_y - 0.02, z - 0.4 * s), scale=(0.34 * s, 0.05, 0.04), mat=post)]
    if shutters:
        for sx in (1, -1):
            out.append(prim('cube', 'shutter', loc=(x + sx * 0.44 * s, front_y - 0.02, z), scale=(0.14 * s, 0.025, 0.4 * s), mat=shutter))
    return out


def walls(w, d, h, mat, front_y=None):
    body = prim('cube', 'walls', loc=(0, 0, h / 2), scale=(w / 2, d / 2, h / 2), mat=mat)
    base = prim('cube', 'plinth', loc=(0, 0, 0.12), scale=(w / 2 + 0.03, d / 2 + 0.03, 0.12), mat=plinth)
    return [body, base]


def farmhouse():
    w, d, h = 4.2, 3.4, 2.5
    P = walls(w, d, h, wall)
    # the pitched roof: two corrugated sheets, ridge across the front
    pitch = 0.5
    half = d / 2 + 0.25
    slope = half / math.cos(pitch)
    for s in (1, -1):
        sheet = corrugated('roof', w + 0.5, slope, 14, roofRed)
        place(sheet, loc=(0, s * half / 2, h + math.tan(pitch) * half / 2), rot=(-s * pitch, 0, 0))
        P.append(sheet)
    # the gables: triangles at both ends
    for sx in (1, -1):
        bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=1, depth=0.1, location=(sx * w / 2, 0, h))
        g = bpy.context.active_object
        g.scale = (half * 1.0, half, 1)
        g.rotation_euler = (0, sx * math.pi / 2, 0)
        g.data.materials.append(wall)
        P.append(place(g, loc=g.location, rot=g.rotation_euler))
    # the stoep: a lean-to roof on four posts along the front, a step
    fy = -d / 2
    for x in (-1.8, -0.6, 0.6, 1.8):
        P.append(prim('cyl', 'post', loc=(x, fy - 1.25, 1.05), scale=(0.06, 0.06, 1.05), mat=post, vertices=8))
    stoep = corrugated('stoep', w + 0.3, 1.5, 12, roofGreen, sag=0.025)
    P.append(place(stoep, loc=(0, fy - 0.72, 2.15), rot=(-0.18, 0, 0)))
    P.append(prim('cube', 'floor', loc=(0, fy - 0.7, 0.1), scale=(w / 2 + 0.1, 0.75, 0.1), mat=plinth))
    P += window(-1.25, 1.35, fy) + window(1.25, 1.35, fy)
    P.append(prim('cube', 'door', loc=(0, fy - 0.02, 0.95), scale=(0.42, 0.03, 0.85), mat=door))
    P.append(prim('cube', 'chimney', loc=(1.3, 0.6, h + 0.75), scale=(0.22, 0.22, 0.5), mat=wallWarm))
    return join(P, 'huis1')


def capedutch():
    w, d, h = 4.6, 3.2, 2.4
    P = walls(w, d, h, wall)
    # thatch: a long pitched roof (ridge along the house), thick
    for s in (1, -1):
        r = prim('cube', 'thatch', loc=(0, s * 0.85, h + 0.55), scale=(w / 2 + 0.25, 1.05, 0.16), rot=(-s * 0.62, 0, 0), mat=thatch)
        P.append(r)
    # the curved front gable over the door (the Cape Dutch sign): a panel with a rounded top and scrolls
    fy = -d / 2
    P.append(prim('cube', 'gable', loc=(0, fy - 0.05, h + 0.55), scale=(0.9, 0.08, 0.55), mat=wall))
    P.append(prim('cyl', 'gabletop', loc=(0, fy - 0.05, h + 1.1), scale=(0.75, 0.75, 0.08), rot=(math.pi / 2, 0, 0), mat=wall, vertices=24))
    for sx in (1, -1):
        P.append(prim('sphere', 'scroll', loc=(sx * 0.95, fy - 0.05, h + 0.2), scale=(0.2, 0.08, 0.2), mat=wall, segments=12, ring_count=8))
    P += window(-1.5, 1.3, fy, s=1.05) + window(1.5, 1.3, fy, s=1.05)
    P.append(prim('cube', 'door', loc=(0, fy - 0.02, 1.0), scale=(0.45, 0.03, 0.9), mat=shutter))
    P.append(prim('cube', 'fanlight', loc=(0, fy - 0.03, 2.0), scale=(0.4, 0.02, 0.12), mat=glass))
    P.append(prim('cube', 'chimney', loc=(-1.9, 0.4, h + 0.9), scale=(0.2, 0.2, 0.45), mat=wall))
    return join(P, 'huis2')


def flatroof():
    w, d, h = 3.6, 3.2, 2.6
    P = walls(w, d, h, wallWarm)
    P.append(prim('cube', 'parapet', loc=(0, 0, h + 0.18), scale=(w / 2 + 0.06, d / 2 + 0.06, 0.18), mat=wallWarm))
    P.append(prim('cube', 'cornice', loc=(0, 0, h + 0.02), scale=(w / 2 + 0.12, d / 2 + 0.12, 0.05), mat=post))
    fy = -d / 2
    for x in (-1.5, 1.5):
        P.append(prim('cyl', 'post', loc=(x, fy - 1.1, 1.0), scale=(0.06, 0.06, 1.0), mat=post, vertices=8))
    P.append(prim('cube', 'stoeproof', loc=(0, fy - 0.6, 2.05), scale=(w / 2 + 0.1, 0.65, 0.05), mat=roofGrey))
    P += window(-0.95, 1.4, fy) + window(1.05, 1.4, fy, shutters=False)
    P.append(prim('cube', 'door', loc=(0.1, fy - 0.02, 0.95), scale=(0.4, 0.03, 0.85), mat=door))
    return join(P, 'huis3')


def church():
    P = []
    w, d, h = 4.4, 8.0, 3.8
    P += walls(w, d, h, wall)
    for s in (1, -1):
        P.append(prim('cube', 'roof', loc=(s * 1.18, 0, h + 0.85), scale=(1.45, d / 2 + 0.2, 0.08), rot=(0, s * 0.7, 0), mat=roofGrey))
    for sy in (1, -1):
        bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=1, depth=0.12, location=(0, sy * d / 2, h))
        g = bpy.context.active_object
        g.scale = (2.3, 1.75, 1)
        g.rotation_euler = (math.pi / 2, 0, 0)
        g.data.materials.append(wall)
        P.append(place(g, loc=g.location, rot=g.rotation_euler))
    # pointed windows down the sides
    for y in (-2.4, -0.8, 0.8, 2.4):
        for sx in (1, -1):
            P.append(prim('cube', 'win', loc=(sx * (w / 2 + 0.01), y, 2.0), scale=(0.02, 0.3, 0.75), mat=glass))
            P.append(prim('cone', 'arch', loc=(sx * (w / 2 + 0.01), y, 2.85), scale=(0.02, 0.3, 0.2), mat=glass, vertices=4, radius1=1, depth=1))
    # the tower and spire at the front
    fy = -d / 2 - 1.1
    P.append(prim('cube', 'tower', loc=(0, fy, 3.6), scale=(1.1, 1.1, 3.6), mat=wall))
    P.append(prim('cube', 'belfry', loc=(0, fy, 7.5), scale=(0.95, 0.95, 0.4), mat=wall))
    P.append(prim('cone', 'spire', loc=(0, fy, 7.9 + 1.4), scale=(1.0, 1.0, 2.8), mat=roofGrey, vertices=8, radius1=1, depth=1))
    P.append(prim('cyl', 'clock', loc=(0, fy - 1.12, 5.6), scale=(0.45, 0.45, 0.04), rot=(math.pi / 2, 0, 0), mat=post, vertices=20))
    P.append(prim('cube', 'door', loc=(0, fy - 1.12, 1.1), scale=(0.55, 0.03, 1.1), mat=door))
    return join(P, 'kerk')


def windpomp():
    P = []
    hgt = 7.5
    for sx in (1, -1):
        for sy in (1, -1):
            leg = prim('cyl', 'leg', loc=(sx * (0.6 - hgt / 2 * 0.075), sy * (0.6 - hgt / 2 * 0.075), hgt / 2), scale=(0.05, 0.05, hgt / 2 + 0.1), rot=(sy * 0.075, -sx * 0.075, 0), mat=steel, vertices=6)
            P.append(leg)
    # cross braces between the legs on each side (the legs lean in: 7.5 cm a metre)
    for z in (1.2, 2.8, 4.3, 5.7, 6.8):
        k = 0.6 - z * 0.075
        for a in range(4):
            r = prim('cube', 'brace', loc=(math.cos(a * math.pi / 2) * k, math.sin(a * math.pi / 2) * k, z), scale=(0.03, k, 0.03), rot=(0, 0, a * math.pi / 2), mat=steel)
            P.append(r)
    P.append(prim('cube', 'platform', loc=(0, 0, hgt + 0.05), scale=(0.35, 0.35, 0.05), mat=steel))
    P.append(prim('cube', 'head', loc=(0, 0.1, hgt + 0.35), scale=(0.15, 0.4, 0.15), mat=dark))
    P.append(prim('cube', 'tail', loc=(0, 1.3, hgt + 0.4), scale=(0.02, 0.8, 0.35), mat=steel))
    tower = join(P, 'windpomp')
    # the rotor: blades round a hub, facing -y (the wind)
    R = [prim('cyl', 'hub', loc=(0, -0.4, hgt + 0.35), scale=(0.18, 0.18, 0.12), rot=(math.pi / 2, 0, 0), mat=dark, vertices=12)]
    for i in range(18):
        a = i / 18 * math.pi * 2
        R.append(prim('cube', 'blade', loc=(math.cos(a) * 0.85, -0.42, hgt + 0.35 + math.sin(a) * 0.85), scale=(0.62, 0.012, 0.11), rot=(0.3, -a, 0), mat=steel))
    rotor = join(R, 'rotor')
    pivot(rotor, (0, -0.42, hgt + 0.35))
    return tower, rotor


def tank():
    P = [prim('cube', 'stand', loc=(0, 0, 0.6), scale=(0.9, 0.9, 0.6), mat=plinth)]
    t = prim('cyl', 'tank', loc=(0, 0, 2.0), scale=(1.0, 1.0, 0.8), mat=steel, vertices=32)
    P.append(t)
    for z in (1.4, 1.7, 2.0, 2.3, 2.6):
        P.append(prim('torus', 'rib', loc=(0, 0, z), scale=(1.0, 1.0, 1.0), mat=steel, major_radius=1.01, minor_radius=0.02, major_segments=32, minor_segments=4))
    P.append(prim('cone', 'lid', loc=(0, 0, 2.95), scale=(1.05, 1.05, 0.18), mat=steel, vertices=32, radius1=1, depth=1))
    return join(P, 'tenk')


farmhouse()
capedutch()
flatroof()
church()
windpomp()
tank()
export(out_path(os.path.join(os.path.dirname(__file__), '..', '..', 'img', 'models', 'dorp.glb')))
