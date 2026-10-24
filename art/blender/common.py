# (1.20) Shared helpers for Stapel's Blender models (run headless: Blender -b -P <model>.py -- <out.glb>).
# Each model is built from code (no hand work): a skin-modifier skeleton made smooth with subdivision, small parts from
# primitives, plain PBR materials, exported as .glb (Y up) into img/models/ for three.js (js/rivier/models.js).
import sys
import bpy
import bmesh
from mathutils import Vector


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'


def out_path(default):
    argv = sys.argv
    return argv[argv.index('--') + 1] if '--' in argv and len(argv) > argv.index('--') + 1 else default


def material(name, color, rough=0.6, metal=0.0, emit=None, emit_k=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*hex_rgb(color), 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*hex_rgb(emit), 1)
        b.inputs['Emission Strength'].default_value = emit_k
    return m


def hex_rgb(h):
    h = h.lstrip('#')
    srgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    # (Blender's colours are linear)
    return tuple(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in srgb)


def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def skin_body(name, points, edges, smooth=2, displace=None):
    """A smooth body from a skeleton: `points` [(x, y, z, rx, ry)], `edges` [(i, j)]; the skin modifier, then subdivision."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, z)) for x, y, z, _, _ in points]
    for i, j in edges:
        bm.edges.new((vs[i], vs[j]))
    bm.to_mesh(me)
    bm.free()
    obj = link(bpy.data.objects.new(name, me))
    obj.modifiers.new('Skin', 'SKIN')
    for i, (_, _, _, rx, ry) in enumerate(points):
        me.skin_vertices[0].data[i].radius = (rx, ry)
    me.skin_vertices[0].data[0].use_root = True
    if displace:
        tex = bpy.data.textures.new(name + '_bumps', displace.get('kind', 'VORONOI'))
        if hasattr(tex, 'noise_scale'):
            tex.noise_scale = displace.get('scale', 0.05)
        d = obj.modifiers.new('Displace', 'DISPLACE')
        d.texture = tex
        d.strength = displace.get('strength', 0.01)
        d.mid_level = 0.5
    s = obj.modifiers.new('Subsurf', 'SUBSURF')
    s.levels = smooth
    s.render_levels = smooth
    if displace:
        # (bumps after the first smoothing: move the displace between two subdivisions)
        obj.modifiers.move(obj.modifiers.find('Displace'), len(obj.modifiers) - 1)
        s2 = obj.modifiers.new('Subsurf2', 'SUBSURF')
        s2.levels = 1
        s2.render_levels = 1
    return obj


def apply(obj, tris=None):
    """Makes the modifiers real (a plain mesh), shaded smooth; `tris`: thinned to about that many triangles (phones)."""
    if tris:
        dg = bpy.context.evaluated_depsgraph_get()
        ev = obj.evaluated_get(dg).to_mesh()
        now = sum(len(p.vertices) - 2 for p in ev.polygons)
        obj.evaluated_get(dg).to_mesh_clear()
        if now > tris:
            d = obj.modifiers.new('Decimate', 'DECIMATE')
            d.ratio = tris / now
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    for p in obj.data.polygons:
        p.use_smooth = True
    return obj


def prim(kind, name, loc=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0), mat=None, **kw):
    fn = {'sphere': bpy.ops.mesh.primitive_uv_sphere_add, 'cone': bpy.ops.mesh.primitive_cone_add,
          'cyl': bpy.ops.mesh.primitive_cylinder_add, 'cube': bpy.ops.mesh.primitive_cube_add,
          'torus': bpy.ops.mesh.primitive_torus_add, 'ico': bpy.ops.mesh.primitive_ico_sphere_add}[kind]
    fn(location=loc, rotation=rot, **kw)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if mat:
        o.data.materials.append(mat)
    for p in o.data.polygons:
        p.use_smooth = kind not in ('cube',)
    return o


def join(objs, name):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = name
    return o


def pivot(obj, at):
    """Moves the object's origin to `at` (world): the joint it turns about in the game."""
    cur = bpy.context.scene.cursor.location.copy()
    bpy.context.scene.cursor.location = Vector(at)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.origin_set(type='ORIGIN_CURSOR')
    bpy.context.scene.cursor.location = cur


def export(path):
    for o in bpy.context.view_layer.objects:
        o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_normals=True, export_materials='EXPORT', export_texcoords=False, export_cameras=False,
                              export_lights=False, export_animations=False)
    tri = sum(len(o.data.loop_triangles) if (o.data.calc_loop_triangles() or True) else 0 for o in bpy.context.view_layer.objects if o.type == 'MESH')
    print(f'[model] {path}: {len(list(bpy.context.view_layer.objects))} parts, {tri} triangles')
