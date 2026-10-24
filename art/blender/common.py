# (1.20) Shared helpers for Stapel's Blender models (run headless: Blender -b -P <model>.py -- <out.glb>).
# Each model is built from code (no hand work): a skin-modifier skeleton made smooth with subdivision, small parts from
# primitives, plain PBR materials, exported as .glb (Y up) into img/models/ for three.js (js/rivier/models.js).
import os
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
    textured = any(n.type == 'TEX_IMAGE' for m in bpy.data.materials if m.node_tree for n in m.node_tree.nodes)
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                              export_normals=True, export_materials='EXPORT', export_texcoords=textured, export_cameras=False,
                              export_lights=False, export_animations=False, export_image_format='JPEG' if textured else 'AUTO',
                              export_jpeg_quality=88)
    tri = sum(len(o.data.loop_triangles) if (o.data.calc_loop_triangles() or True) else 0 for o in bpy.context.view_layer.objects if o.type == 'MESH')
    print(f'[model] {path}: {len(list(bpy.context.view_layer.objects))} parts, {tri} triangles')


# ------------------------------------------------------------------------------------------------ baking
def _select(objs, active):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = active


def detail(mat, kind, scale=20.0, mix=0.35, color2=None):
    """Adds surface detail to a material's colour (baked into the texture later): 'scales' (Voronoi cells), 'noise'
    (blotches), 'stripes' (fine weave, e.g. denim). `color2`: the second colour (default: a darker shade)."""
    nt = mat.node_tree
    b = nt.nodes.get('Principled BSDF')
    base = tuple(b.inputs['Base Color'].default_value)
    c2 = (*hex_rgb(color2), 1) if color2 else (base[0] * 0.55, base[1] * 0.55, base[2] * 0.55, 1)
    if kind == 'scales':
        tex = nt.nodes.new('ShaderNodeTexVoronoi')
        tex.feature = 'DISTANCE_TO_EDGE'
        fac = tex.outputs['Distance']
    elif kind == 'stripes':
        tex = nt.nodes.new('ShaderNodeTexWave')
        tex.wave_type = 'BANDS'
        tex.inputs['Distortion'].default_value = 2.0
        fac = tex.outputs['Fac']
    else:
        tex = nt.nodes.new('ShaderNodeTexNoise')
        tex.inputs['Detail'].default_value = 6
        fac = tex.outputs['Fac']
    tex.inputs['Scale'].default_value = scale
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = c2
    ramp.color_ramp.elements[1].color = base
    if kind == 'scales':
        ramp.color_ramp.elements[0].position = 0.0
        ramp.color_ramp.elements[1].position = 0.12
    nt.links.new(fac, ramp.inputs['Fac'])
    mixn = nt.nodes.new('ShaderNodeMix')
    mixn.data_type = 'RGBA'
    mixn.inputs['Factor'].default_value = mix
    mixn.inputs['A'].default_value = base
    nt.links.new(ramp.outputs['Color'], mixn.inputs['B'])
    nt.links.new(mixn.outputs['Result'], b.inputs['Base Color'])
    return mat


def bake_set(objs, name, size=1024, highs=None, samples=24, out_dir=None, ao_dist=0.18, ao_k=0.5):
    """Bakes `objs` (low-poly parts) into one texture set: colour x ambient occlusion, roughness/metal, and (from
    `highs`, a matching list of finer copies, or None) a normal map. Each part then has one material using them."""
    import numpy as np
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.cycles.device = 'CPU'
    scene.cycles.samples = samples
    scene.render.bake.margin = 6
    scene.render.bake.use_clear = False
    # (occlusion only from what's close: the folds and joints, not the whole body round a thin limb)
    if scene.world is None:
        scene.world = bpy.data.worlds.new('bake')
    scene.world.light_settings.distance = ao_dist
    # one UV layout for all the parts
    _select(objs, objs[0])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.015, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    imgs = {}
    for k, clr in (('col', (0, 0, 0, 1)), ('ao', (1, 1, 1, 1)), ('rough', (0.5, 0.5, 0.5, 1)), ('nrm', (0.5, 0.5, 1, 1))):
        im = bpy.data.images.new(f'{name}_{k}', size, size, alpha=False, float_buffer=False)
        im.generated_color = clr
        if k != 'col':
            im.colorspace_settings.name = 'Non-Color'
        imgs[k] = im

    def target(img):
        for o in objs:
            for m in o.data.materials:
                nt = m.node_tree
                n = nt.nodes.get('__bake') or nt.nodes.new('ShaderNodeTexImage')
                n.name = '__bake'
                n.image = img
                nt.nodes.active = n

    def run(kind, img, **kw):
        target(img)
        for o in objs:
            _select([o], o)
            bpy.ops.object.bake(type=kind, **kw)

    # (the finer copies stay out of the colour, shadow and roughness passes: they'd shade the parts they sit on)
    for hi in (highs or []):
        if hi is not None:
            hi.hide_render = True
    run('DIFFUSE', imgs['col'], pass_filter={'COLOR'})
    run('AO', imgs['ao'])
    run('ROUGHNESS', imgs['rough'])
    if highs:
        for hi in highs:
            if hi is not None:
                hi.hide_render = False
        target(imgs['nrm'])
        for lo, hi in zip(objs, highs):
            if hi is None:
                continue
            _select([hi, lo], lo)
            bpy.ops.object.bake(type='NORMAL', use_selected_to_active=True, cage_extrusion=0.03, max_ray_distance=0.08)
    # colour x (soft) occlusion
    col = np.array(imgs['col'].pixels[:]).reshape(-1, 4)
    ao = np.array(imgs['ao'].pixels[:]).reshape(-1, 4)[:, :1]
    col[:, :3] *= (1 - ao_k) + ao_k * ao
    imgs['col'].pixels[:] = col.ravel()
    # (glTF: roughness in green, metal in blue)
    r = np.array(imgs['rough'].pixels[:]).reshape(-1, 4)
    mr = np.zeros_like(r)
    mr[:, 1] = r[:, 0]
    mr[:, 3] = 1
    imgs['rough'].pixels[:] = mr.ravel()
    dbg = os.environ.get('BAKE_DEBUG')
    if dbg:
        for k, im in imgs.items():
            im.filepath_raw = os.path.join(dbg, f'{name}_{k}.png')
            im.file_format = 'PNG'
            im.save()
    for k in ('col', 'rough', 'nrm'):
        imgs[k].pack()
    # one material per part: the baked set (keeps any glow the part had)
    for o in objs:
        glow = None
        for m in o.data.materials:
            b = m.node_tree.nodes.get('Principled BSDF')
            if b and b.inputs['Emission Strength'].default_value > 0:
                glow = (tuple(b.inputs['Emission Color'].default_value), b.inputs['Emission Strength'].default_value)
        m = bpy.data.materials.new(f'{name}_{o.name}')
        m.use_nodes = True
        nt = m.node_tree
        b = nt.nodes.get('Principled BSDF')
        tc = nt.nodes.new('ShaderNodeTexImage')
        tc.image = imgs['col']
        nt.links.new(tc.outputs['Color'], b.inputs['Base Color'])
        tr = nt.nodes.new('ShaderNodeTexImage')
        tr.image = imgs['rough']
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(tr.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        b.inputs['Metallic'].default_value = 0.0
        if highs:
            tn = nt.nodes.new('ShaderNodeTexImage')
            tn.image = imgs['nrm']
            nm = nt.nodes.new('ShaderNodeNormalMap')
            nt.links.new(tn.outputs['Color'], nm.inputs['Color'])
            nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
        if glow:
            b.inputs['Emission Color'].default_value = glow[0]
            b.inputs['Emission Strength'].default_value = glow[1] * 0.5
        o.data.materials.clear()
        o.data.materials.append(m)
    for hi in (highs or []):
        if hi is not None:
            bpy.data.objects.remove(hi, do_unlink=True)


def high_copy(obj, levels=2, bumps=None):
    """A finer copy of `obj` for the normal map: smoother, with `bumps` ({'kind', 'scale', 'strength'}) pressed in."""
    c = obj.copy()
    c.data = obj.data.copy()
    bpy.context.collection.objects.link(c)
    s = c.modifiers.new('Subsurf', 'SUBSURF')
    s.levels = levels
    s.render_levels = levels
    if bumps:
        tex = bpy.data.textures.new(obj.name + '_hb', bumps.get('kind', 'VORONOI'))
        if hasattr(tex, 'noise_scale'):
            tex.noise_scale = bumps.get('scale', 0.03)
        d = c.modifiers.new('Displace', 'DISPLACE')
        d.texture = tex
        d.strength = bumps.get('strength', 0.006)
        d.mid_level = 0.5
    return apply(c)
