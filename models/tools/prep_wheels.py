"""Turns downloaded wheel models into clean rims the site can fit to any car.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \
        --python models/tools/prep_wheels.py -- <folder with downloaded .glb files> models/wheels

For each wheel (settings in WHEELS below) it keeps only the rim (no tyre, backdrop or logo), slims very heavy
models, turns it so the axle runs along Z with the face looking towards +Z, centres it on the axle and scales
it so the rim's outer diameter is exactly 1. The site then scales it to the chosen size and makes a tyre to fit.
"""
import bpy, bmesh, sys, pathlib, math, mathutils

src, out = (pathlib.Path(a) for a in sys.argv[sys.argv.index("--") + 1:][:2])
out.mkdir(parents=True, exist_ok=True)

# keep: object-name test; split_tyre: the tyre is part of the same mesh (drop the outermost loose part);
# face_hub: the face is on the side where the spokes meet the hub (False for deep-dish, whose spokes sit inboard);
# max_tris: slim down models heavier than this.
WHEELS = {
    "mesh":       dict(keep=lambda n: n in ("Object_2", "Object_4", "Object_7"), face_hub=True),
    "monoblock":  dict(keep=lambda n: True, face_hub=True),
    "multispoke": dict(keep=lambda n: True, split_tyre=True, face_hub=True),
    "deepdish":   dict(keep=lambda n: True, face_hub=False),
    "turbofan":   dict(keep=lambda n: "Tire" not in n, face_hub=True, max_tris=26000),
}

for name, cfg in WHEELS.items():
    f = src / f"{name}.glb"
    if not f.exists():
        print("missing", f); continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(f))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    for o in meshes:
        if not cfg["keep"](o.name):
            bpy.data.objects.remove(o, do_unlink=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    # Bake every transform in, then join into one object (materials stay separate).
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for o in list(bpy.context.scene.objects):
        if o != ob:
            bpy.data.objects.remove(o, do_unlink=True)
    me = ob.data
    # The axle is the thinnest direction of the bounding box.
    co = [v.co.copy() for v in me.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]; hi = [max(c[i] for c in co) for i in range(3)]
    size = [hi[i] - lo[i] for i in range(3)]; axis = size.index(min(size))
    centre = mathutils.Vector([(hi[i] + lo[i]) / 2 for i in range(3)])
    others = [i for i in range(3) if i != axis]
    radial = lambda c: math.hypot(c[others[0]] - centre[others[0]], c[others[1]] - centre[others[1]])
    # A tyre in the same mesh: remove the loose part that reaches furthest out.
    if cfg.get("split_tyre"):
        bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
        seen, parts = set(), []
        for v in bm.verts:
            if v.index in seen: continue
            stack, part = [v], []
            seen.add(v.index)
            while stack:
                a = stack.pop(); part.append(a)
                for e in a.link_edges:
                    b = e.other_vert(a)
                    if b.index not in seen: seen.add(b.index); stack.append(b)
            parts.append(part)
        rmax = max(radial(v.co) for v in bm.verts)
        tyres = [p for p in parts if min(radial(v.co) for v in p) > 0.72 * rmax]
        bmesh.ops.delete(bm, geom=[v for p in tyres for v in p], context="VERTS")
        bm.to_mesh(me); bm.free()
        print(name, "removed", len(tyres), "tyre part(s)")
    # Slim heavy models.
    tris = sum(len(p.vertices) - 2 for p in me.polygons)
    if cfg.get("max_tris") and tris > cfg["max_tris"]:
        mod = ob.modifiers.new("slim", "DECIMATE"); mod.ratio = cfg["max_tris"] / tris
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Re-measure (after removing the tyre) and work out which side the face is on.
    co = [v.co.copy() for v in me.vertices]
    lo = [min(c[i] for c in co) for i in range(3)]; hi = [max(c[i] for c in co) for i in range(3)]
    centre = mathutils.Vector([(hi[i] + lo[i]) / 2 for i in range(3)])
    rmax = max(radial(c) for c in co)
    hub = [c[axis] for c in co if radial(c) < 0.3 * rmax]
    hub_side = 1 if (sum(hub) / max(1, len(hub))) > centre[axis] else -1
    face = hub_side if cfg["face_hub"] else -hub_side
    # Move to the axle centre, turn the axle onto Z with the face towards +Z, scale to diameter 1.
    me.transform(mathutils.Matrix.Translation(-centre))
    to_z = {0: mathutils.Matrix.Rotation(math.radians(-90 * face), 4, "Y"),
            1: mathutils.Matrix.Rotation(math.radians(90 * face), 4, "X"),
            2: mathutils.Matrix.Identity(4) if face > 0 else mathutils.Matrix.Rotation(math.pi, 4, "Y")}[axis]
    me.transform(to_z)
    me.transform(mathutils.Matrix.Scale(1 / (2 * rmax), 4))
    me.update()
    co = [v.co for v in me.vertices]
    depth = max(c.z for c in co) - min(c.z for c in co)
    bpy.ops.export_scene.gltf(filepath=str(out / f"{name}.glb"), export_format="GLB", use_selection=False,
                              export_image_format="JPEG", export_jpeg_quality=85, export_apply=True)
    print(f"{name}: tris={sum(len(p.vertices) - 2 for p in me.polygons)} depth/diameter={depth:.3f} face={'hub' if cfg['face_hub'] else 'opposite hub'}")
