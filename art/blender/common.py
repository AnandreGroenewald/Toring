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


def bake_set(objs, name, size=1024, highs=None, samples=24, out_dir=None, ao_dist=0.18, ao_k=0.5, rough_map=False):
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
        # (each part on its own: parts made at the same joint overlap, and would shade each other in blotches)
        meshes = [m for m in bpy.context.view_layer.objects if m.type == 'MESH']
        was = {m.name: m.hide_render for m in meshes}
        for o in objs:
            for m in meshes:
                m.hide_render = m is not o
            _select([o], o)
            bpy.ops.object.bake(type=kind, **kw)
        for m in meshes:
            m.hide_render = was[m.name]

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
    # (phones: a roughness map costs as much memory as the colour and shows little at this size: one value instead)
    rough_mean = float(r[:, 0][r[:, 3] > 0].mean()) if (r[:, 3] > 0).any() else 0.7
    keep = ('col', 'rough', 'nrm') if rough_map else ('col', 'nrm')
    for k in keep:
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
        if rough_map:
            tr = nt.nodes.new('ShaderNodeTexImage')
            tr.image = imgs['rough']
            sep = nt.nodes.new('ShaderNodeSeparateColor')
            nt.links.new(tr.outputs['Color'], sep.inputs['Color'])
            nt.links.new(sep.outputs['Green'], b.inputs['Roughness'])
        else:
            b.inputs['Roughness'].default_value = max(0.3, min(0.95, rough_mean))
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


# ------------------------------------------------------------------------------------------------ premium parts
def _orient(obj, look):
    """Turns `obj` (made facing Blender's +z) to face `look`, then makes the turn real."""
    q = Vector((0, 0, 1)).rotation_difference(Vector(look).normalized())
    obj.rotation_mode = 'QUATERNION'
    obj.rotation_quaternion = q
    _select([obj], obj)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def eye(name, loc, r, look, iris='#d9e04a', pupil='round', lid=0.3, lid_mat=None, low_lid=0.0, iris_k=0.62):
    """A premium cartoon eye: a glossy white ball, a coloured iris with a pupil ('round' or 'slit'), a sparkle of light,
    and lids of the skin's material (`lid` 0..1 how far the upper lid comes down; `low_lid` the lower one). Returns the
    parts (to join into the head). `look`: where the eye looks (Blender axes)."""
    lv = Vector(look).normalized()
    up = Vector((0, 0, 1))
    side = lv.cross(up).normalized() if abs(lv.dot(up)) < 0.95 else Vector((0, 1, 0))
    upv = side.cross(lv).normalized()
    out = []
    white = material(name + '_white', '#f6f3ea', rough=0.12)
    ball = prim('sphere', name + '_ball', loc=loc, scale=(r, r, r), mat=white, segments=16, ring_count=10)
    out.append(ball)
    imat = material(name + '_iris', iris, rough=0.1, emit=iris, emit_k=0.25)
    ir = prim('sphere', name + '_iris', loc=(0, 0, 0), scale=(r * iris_k, r * iris_k, r * 0.28), mat=imat, segments=16, ring_count=8)
    _orient(ir, lv)
    ir.location = Vector(loc) + lv * (r * 0.8)
    out.append(ir)
    pmat = material(name + '_pupil', '#0b0b0d', rough=0.05)
    ps = (r * 0.16, r * 0.5, r * 0.3) if pupil == 'slit' else (r * 0.32, r * 0.32, r * 0.3)
    pu = prim('sphere', name + '_pupil', loc=(0, 0, 0), scale=ps, mat=pmat, segments=14, ring_count=8)
    # (a slit stands up: its long side along the eye's up)
    if pupil == 'slit':
        q = Vector((0, 0, 1)).rotation_difference(lv)
        pu.rotation_mode = 'QUATERNION'
        # make the slit's long axis (local y) follow the eye's up
        yl = q @ Vector((0, 1, 0))
        twist = yl.rotation_difference(upv)
        pu.rotation_quaternion = twist @ q
        _select([pu], pu)
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    else:
        _orient(pu, lv)
    pu.location = Vector(loc) + lv * (r * 0.9)
    out.append(pu)
    smat = material(name + '_spark', '#ffffff', rough=0.0, emit='#ffffff', emit_k=4.0)
    sp = prim('sphere', name + '_spark', loc=tuple(Vector(loc) + lv * (r * 0.93) + upv * (r * 0.32) + side * (r * 0.22)), scale=(r * 0.14, r * 0.14, r * 0.14), mat=smat, segments=10, ring_count=6)
    out.append(sp)
    sp2 = prim('sphere', name + '_spark2', loc=tuple(Vector(loc) + lv * (r * 0.95) - upv * (r * 0.25) - side * (r * 0.18)), scale=(r * 0.06, r * 0.06, r * 0.06), mat=smat, segments=8, ring_count=5)
    out.append(sp2)
    if lid_mat is not None:
        for k, amount in (('up', lid), ('low', low_lid)):
            if amount <= 0:
                continue
            # a shell a little bigger than the ball, cut to a cap, turned down over the eye
            bpy.ops.mesh.primitive_uv_sphere_add(segments=18, ring_count=10, radius=r * 1.1, location=(0, 0, 0))
            cap = bpy.context.active_object
            cap.name = f'{name}_lid{k}'
            bm = bmesh.new()
            bm.from_mesh(cap.data)
            cut = 1 - 2 * amount   # (a cap down to this height of the ball: 1 = nothing, -1 = all of it)
            bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.co.z < cut * r * 1.1], context='VERTS')
            bm.to_mesh(cap.data)
            bm.free()
            # (the upper lid's cap stands on the eye's up; the lower one on its down)
            _orient(cap, upv if k == 'up' else -upv)
            # lean it forward over the eye a little
            cap.data.materials.append(lid_mat)
            for p in cap.data.polygons:
                p.use_smooth = True
            sol = cap.modifiers.new('Thick', 'SOLIDIFY')
            sol.thickness = r * 0.12
            _select([cap], cap)
            bpy.ops.object.convert(target='MESH')
            cap.location = loc
            out.append(cap)
    return out


def bands(mat, scale=4.0, mix=0.4, color2=None, axis='X', distort=3.0):
    """Dark bands across a material's colour (a crocodile's back, a tiger's stripes), baked into the texture later."""
    nt = mat.node_tree
    b = nt.nodes.get('Principled BSDF')
    src = b.inputs['Base Color'].links[0].from_socket if b.inputs['Base Color'].links else None
    base = tuple(b.inputs['Base Color'].default_value)
    c2 = (*hex_rgb(color2), 1) if color2 else (base[0] * 0.45, base[1] * 0.45, base[2] * 0.45, 1)
    tex = nt.nodes.new('ShaderNodeTexWave')
    tex.wave_type = 'BANDS'
    tex.bands_direction = axis
    tex.inputs['Scale'].default_value = scale
    tex.inputs['Distortion'].default_value = distort
    tex.inputs['Detail'].default_value = 3
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = 0.55
    ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    ramp.color_ramp.elements[1].position = 0.8
    ramp.color_ramp.elements[1].color = (0, 0, 0, 1)
    nt.links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
    mixn = nt.nodes.new('ShaderNodeMix')
    mixn.data_type = 'RGBA'
    if src is not None:
        nt.links.new(src, mixn.inputs['A'])
    else:
        mixn.inputs['A'].default_value = base
    mixn.inputs['B'].default_value = c2
    f = nt.nodes.new('ShaderNodeMath')
    f.operation = 'MULTIPLY'
    f.inputs[1].default_value = mix
    nt.links.new(ramp.outputs['Color'], f.inputs[0])
    nt.links.new(f.outputs['Value'], mixn.inputs['Factor'])
    nt.links.new(mixn.outputs['Result'], b.inputs['Base Color'])
    return mat


def gradient(mat, top, bottom, z0, z1):
    """The colour runs from `bottom` (at height z0) to `top` (z1): a darker back over a pale belly, baked in later."""
    nt = mat.node_tree
    b = nt.nodes.get('Principled BSDF')
    geo = nt.nodes.new('ShaderNodeNewGeometry')
    sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs['Vector'])
    mr = nt.nodes.new('ShaderNodeMapRange')
    mr.inputs['From Min'].default_value = z0
    mr.inputs['From Max'].default_value = z1
    nt.links.new(sep.outputs['Z'], mr.inputs['Value'])
    ramp = nt.nodes.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].color = (*hex_rgb(bottom), 1)
    ramp.color_ramp.elements[1].color = (*hex_rgb(top), 1)
    nt.links.new(mr.outputs['Result'], ramp.inputs['Fac'])
    nt.links.new(ramp.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Base Color'].default_value = (*hex_rgb(top), 1)
    return mat


def _to_srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def palettize(objs, name, cell=8, cols=8, rough=0.32):
    """All the small parts' flat colours in one little palette picture (each colour a `cell`-pixel square), every face
    pointing its UVs at its colour: one material for the lot (one draw call on the phone instead of one per colour).
    Glowing colours (eye sparkles, lenses) go into the palette's glow picture. Call before joining them on."""
    import numpy as np
    keys = {}

    def key_of(m):
        b = m.node_tree.nodes.get('Principled BSDF')
        c = tuple(round(x, 4) for x in b.inputs['Base Color'].default_value[:3])
        k = b.inputs['Emission Strength'].default_value
        e = tuple(round(min(1.0, x * min(1.0, k)), 4) for x in b.inputs['Emission Color'].default_value[:3]) if k > 0 else (0.0, 0.0, 0.0)
        return (c, e)

    for o in objs:
        if not o.data.uv_layers:
            o.data.uv_layers.new(name='UVMap')
        uv = o.data.uv_layers.active
        for p in o.data.polygons:
            if not o.data.materials:
                continue
            idx = keys.setdefault(key_of(o.data.materials[p.material_index]), len(keys))
            cx, cy = idx % cols, idx // cols
            u = (cx + 0.5) / cols
            v = (cy + 0.5) / cols
            for li in p.loop_indices:
                uv.data[li].uv = (u, v)
    size = cell * cols
    assert len(keys) <= cols * cols, 'too many colours for the palette'
    col = np.zeros((size, size, 4), dtype=np.float32)
    emi = np.zeros((size, size, 4), dtype=np.float32)
    col[:, :, 3] = 1
    emi[:, :, 3] = 1
    for (c, e), idx in keys.items():
        cx, cy = idx % cols, idx // cols
        col[cy * cell:(cy + 1) * cell, cx * cell:(cx + 1) * cell, :3] = [_to_srgb(x) for x in c]
        emi[cy * cell:(cy + 1) * cell, cx * cell:(cx + 1) * cell, :3] = [_to_srgb(x) for x in e]
    imgs = []
    for nm, arr in (('col', col), ('glow', emi)):
        im = bpy.data.images.new(f'{name}_pal_{nm}', size, size, alpha=False)
        im.pixels[:] = arr.ravel()
        im.pack()
        imgs.append(im)
    m = bpy.data.materials.new(f'{name}_palette')
    m.use_nodes = True
    nt = m.node_tree
    b = nt.nodes.get('Principled BSDF')
    tc = nt.nodes.new('ShaderNodeTexImage')
    tc.image = imgs[0]
    tc.interpolation = 'Closest'
    nt.links.new(tc.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    if any(e != (0.0, 0.0, 0.0) for _, e in keys):
        te = nt.nodes.new('ShaderNodeTexImage')
        te.image = imgs[1]
        te.interpolation = 'Closest'
        nt.links.new(te.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = 1.0
    for o in objs:
        o.data.materials.clear()
        o.data.materials.append(m)
    return m
