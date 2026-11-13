"""Prepares a car model that came from a driving game for the site's 3D view. Runs inside Blender:

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \
        --python models/tools/prep_game_model.py -- models/bmw440i-prep.json

Game models differ from the Golf's (see prep_model.py): each part comes in several overlapping versions
(painted, black, chrome, carbon...), the wheels are missing (the game adds them separately), and the cabin is
usually left-hand drive. The JSON file lists, by object name (regexes), what to delete, what is paint, glass and
lights, and which interior parts to mirror. The script then:
  1. deletes the unwanted versions, faces the car towards +X (metres, on the ground)
  2. names the materials the site looks for: Paint, Glass_Front, Glass_Rear, Lens_Front, Lens_Rear
  3. mirrors the cabin to right-hand drive
  4. builds four wheels (Wheel_FL ...) round the model's brake discs (or at "hubs" when it has none): one of the site's rims (models/wheels/),
     a tyre and a brake caliper, so the site's wheel and brake mods work as on the Golf
  5. saves a GLB file and prints a summary
"""
import json
import math
import pathlib
import re
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

cfg_path = pathlib.Path(sys.argv[sys.argv.index("--") + 1]).resolve()
cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
base = cfg_path.parent
src, out = base / cfg["source"], base / cfg["output"]
matches = lambda name, pats: any(re.match(p, name) for p in pats)

# ---------- 1. load, tidy, delete unwanted versions ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src))
for o in [o for o in bpy.data.objects if o.type == "MESH"]:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
for o in [o for o in bpy.data.objects if o.type != "MESH"]:
    bpy.data.objects.remove(o, do_unlink=True)
deleted = 0
for o in list(bpy.data.objects):
    if matches(o.name, cfg["delete"]):
        bpy.data.objects.remove(o, do_unlink=True); deleted += 1
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for o in meshes:  # games reuse one mesh for e.g. all four brake discs: give each part its own copy before moving it
    if o.data.users > 1:
        o.data = o.data.copy()
print(f"Deleted {deleted} unwanted part versions, {len(meshes)} parts left")


def bake(o, m):
    o.data.transform(m @ o.matrix_world)
    o.matrix_world = Matrix.Identity(4)


def bounds(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    return (Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts))),
            Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts))))


# Face +X, real size, centred, tyres on the ground (the tyre bottom is worked out from the discs below).
turn = {"+X": 0, "+Y": -90, "-X": 180, "-Y": 90}[cfg["front"]]
lo, hi = bounds(meshes)
centre = (lo + hi) / 2; centre.z = 0
m = Matrix.Rotation(math.radians(turn), 4, "Z") @ Matrix.Scale(cfg.get("scale", 1.0), 4) @ Matrix.Translation(-centre)
for o in meshes:
    bake(o, m)

# ---------- 2. standard materials ----------
def single_material(objs, name):
    if not objs:
        return None
    mat = objs[0].data.materials[0].copy()
    mat.name = name
    for o in objs:
        o.data.materials.clear(); o.data.materials.append(mat)
    return mat


paint = [o for o in meshes if matches(o.name, cfg["paint"])]
pm = single_material(paint, "Paint")
if pm and pm.use_nodes:  # a neutral starting colour; the site recolours it
    b = next((n for n in pm.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
    if b:
        b.inputs["Base Color"].default_value = (0.75, 0.76, 0.78, 1)
        b.inputs["Roughness"].default_value = 0.3
        b.inputs["Metallic"].default_value = 0.0
glass = [o for o in meshes if matches(o.name, cfg["glass"])]
lo, hi = bounds(meshes)
split_x = (lo.x + hi.x) / 2 - 0.25  # windows behind the front doors count as rear (dark tint is legal there)
single_material([o for o in glass if (bounds([o])[0].x + bounds([o])[1].x) / 2 >= split_x], "Glass_Front")
single_material([o for o in glass if (bounds([o])[0].x + bounds([o])[1].x) / 2 < split_x], "Glass_Rear")
single_material([o for o in meshes if matches(o.name, cfg["lensFront"])], "Lens_Front")
single_material([o for o in meshes if matches(o.name, cfg["lensRear"])], "Lens_Rear")
# Lights painted into a shared texture (one atlas for lights, grille, badges...): the faces whose texture spot
# falls in the given boxes (image coordinates 0-1, top left [u0, v0, u1, v1]) get their own Lens_Front / Lens_Rear copy.
if "lensUV" in cfg:
    lu = cfg["lensUV"]
    for o in [o for o in meshes if any(sl.material and sl.material.name == lu["material"] for sl in o.material_slots)]:
        me = o.data; uv = me.uv_layers.active.data; src_i = [i for i, sl in enumerate(o.material_slots) if sl.material and sl.material.name == lu["material"]][0]
        for kind in ("Front", "Rear"):
            boxes = lu.get(kind.lower(), [])
            name = "Lens_" + kind
            lens = bpy.data.materials.get(name) or me.materials[src_i].copy()
            lens.name = name
            hit = [poly for poly in me.polygons if poly.material_index == src_i and any(
                b[0] <= sum(uv[li].uv.x for li in poly.loop_indices) / poly.loop_total <= b[2] and
                b[1] <= 1 - sum(uv[li].uv.y for li in poly.loop_indices) / poly.loop_total <= b[3] for b in boxes)]
            if hit:
                if name not in [m_.name for m_ in me.materials if m_]:
                    me.materials.append(lens)
                k = [i for i, m_ in enumerate(me.materials) if m_ and m_.name == name][0]
                for poly in hit:
                    poly.material_index = k
                print(f"{name}: {len(hit)} faces split out of {o.name}")
# Faces of a shared texture that should just be body paint (e.g. a badge for the wrong engine):
# {"material": name, "boxes": [[u0, v0, u1, v1], ...]} in image coordinates, like lensUV.
if "paintUV" in cfg and pm:
    pu = cfg["paintUV"]
    for o in [o for o in meshes if any(sl.material and sl.material.name == pu["material"] for sl in o.material_slots)]:
        me = o.data; uv = me.uv_layers.active.data; src_i = [i for i, sl in enumerate(o.material_slots) if sl.material and sl.material.name == pu["material"]][0]
        hit = [poly for poly in me.polygons if poly.material_index == src_i and any(
            b[0] <= sum(uv[li].uv.x for li in poly.loop_indices) / poly.loop_total <= b[2] and
            b[1] <= 1 - sum(uv[li].uv.y for li in poly.loop_indices) / poly.loop_total <= b[3] for b in pu["boxes"])]
        if hit:
            if "Paint" not in [m_.name for m_ in me.materials if m_]:
                me.materials.append(pm)
            k = [i for i, m_ in enumerate(me.materials) if m_ and m_.name == "Paint"][0]
            for poly in hit:
                poly.material_index = k
            print(f"Paint: {len(hit)} badge faces of {o.name} painted over")
# Paint over parts of a texture (e.g. a foreign number plate): {"image name": [[u0, v0, u1, v1, r, g, b], ...]} (image coordinates).
for img_name, rects in cfg.get("fillUV", {}).items():
    img = next((i for i in bpy.data.images if i.name.startswith(img_name)), None)
    if not img:
        continue
    W, H = img.size; px = list(img.pixels)
    for u0, v0, u1, v1, r, g, b_ in rects:
        for y in range(int((1 - v1) * H), int((1 - v0) * H)):
            for x in range(int(u0 * W), int(u1 * W)):
                i = (y * W + x) * 4; px[i:i + 3] = (r, g, b_)
    img.pixels = px; img.pack()
    print(f"Painted {len(rects)} areas of {img.name}")
print(f"Paint parts {len(paint)}, windows {len(glass)}")
# Games colour some parts at run time (e.g. the cabin trim), so the file has them plain white: give them real colours.
for prefix, (r, g, b_, rough) in cfg.get("colours", {}).items():
    for mat in [m for m in bpy.data.materials if m.name.startswith(prefix)]:
        bsdf = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if mat.node_tree else None
        if bsdf:
            # Some parts take their colour from per-vertex colours (white): drop that link so this colour shows.
            # A texture link stays (the colour is then ignored and only the roughness changes).
            for link in list(bsdf.inputs["Base Color"].links):
                if link.from_node.type in ("VERTEX_COLOR", "ATTRIBUTE"):
                    mat.node_tree.links.remove(link)
            bsdf.inputs["Base Color"].default_value = (r, g, b_, 1)
            bsdf.inputs["Roughness"].default_value = rough

# ---------- 3. right-hand drive ----------
cabin = [o for o in meshes if matches(o.name, cfg.get("cabin", []))]
if "cabinBox" in cfg:
    # Only the faces inside this box (downloaded file's coordinates, two corners) are mirrored: for models whose
    # dashboard shares an object with outside parts (lights, badges) that must not be flipped.
    corners = [m @ Vector(c) for c in cfg["cabinBox"]]
    blo = Vector([min(c[i] for c in corners) for i in range(3)]); bhi = Vector([max(c[i] for c in corners) for i in range(3)])
    for o in cabin:
        bm = bmesh.new(); bm.from_mesh(o.data)
        inside = [f for f in bm.faces if all(blo[i] <= f.calc_center_median()[i] <= bhi[i] for i in range(3))]
        geom = bmesh.ops.split(bm, geom=inside)["geom"]
        vs = [v for v in geom if isinstance(v, bmesh.types.BMVert)]
        for v in vs:
            v.co.y = -v.co.y
        for f in [f for f in geom if isinstance(f, bmesh.types.BMFace)]:
            f.normal_flip()
        bm.to_mesh(o.data); bm.free()
        print(f"Mirrored {len(inside)} faces of {o.name}")
    cabin = []
for o in cabin:
    o.data.transform(Matrix.Scale(-1, 4, Vector((0, 1, 0))))
    o.data.flip_normals()
print(f"Mirrored {len(cabin)} cabin parts to right-hand drive")

# ---------- 4. wheels ----------
wc = cfg["wheels"]
outer_r, width = wc["tyre"]["outerM"] / 2, wc["tyre"]["widthM"]
rim_r = wc["rimInch"] * 0.0254 / 2
if "hubs" in wc:
    # No brake discs in the model: "hubs" gives each wheel centre in the downloaded file's coordinates,
    # and a plain disc is made at each one (just inboard of the rim).
    discs = []
    for i, p in enumerate(wc["hubs"]):
        c = m @ Vector(p)
        side = 1 if c.y >= 0 else -1
        bm = bmesh.new()
        bmesh.ops.create_circle(bm, cap_ends=True, radius=rim_r * 0.78, segments=48)
        bmesh.ops.solidify(bm, geom=bm.faces[:], thickness=0.022)
        me = bpy.data.meshes.new(f"disc{i}"); bm.to_mesh(me); bm.free()
        d = bpy.data.objects.new(f"disc{i}", me); bpy.context.scene.collection.objects.link(d)
        d.data.transform(Matrix.Rotation(math.radians(90), 4, "X"))  # face along Y (sideways)
        d.data.transform(Matrix.Translation((c.x, side * (wc["trackHalfM"] - 0.07), c.z)))
        d.data.materials.append(bpy.data.materials.new("disc_tmp"))
        discs.append(d)
else:
    discs = [o for o in meshes if matches(o.name, [wc["discs"]])]
hubs = {}
for d in discs:
    dlo, dhi = bounds([d]); c = (dlo + dhi) / 2
    corner = ("Wheel_F" if c.x >= 0 else "Wheel_R") + ("L" if c.y >= 0 else "R")
    hubs[corner] = (d, c)
# Sit the car so the tyres touch the ground.
axle_z = sum(c.z for _, c in hubs.values()) / len(hubs)
lift = outer_r - axle_z
for o in [o for o in bpy.data.objects if o.type == "MESH"]:
    o.data.transform(Matrix.Translation((0, 0, lift)))
for k in hubs:
    hubs[k] = (hubs[k][0], hubs[k][1] + Vector((0, 0, lift)))


def lathe(name, profile, segs=72):
    """A solid of revolution round the Y axis (profile: (radius, y) points), as a new object."""
    bm = bmesh.new()
    rings = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        rings.append([bm.verts.new((r * math.cos(a), y, r * math.sin(a))) for r, y in profile])
    for i in range(segs):
        r0, r1 = rings[i], rings[(i + 1) % segs]
        for j in range(len(profile) - 1):
            bm.faces.new((r0[j], r1[j], r1[j + 1], r0[j + 1]))
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons:
        p.use_smooth = True
    o = bpy.data.objects.new(name, me); bpy.context.scene.collection.objects.link(o)
    return o


def material(name, colour, rough, metal=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    b = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (*colour, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return mat


tyre_mat, cal_mat, disc_mat = material("Tyre", (0.02, 0.02, 0.022), 0.9), material("Caliper", (0.05, 0.05, 0.055), 0.45, 0.3), material("Disc", (0.32, 0.32, 0.33), 0.45, 0.9)
w = width / 2
tyre_profile = [(rim_r, -w * 0.82), (rim_r + (outer_r - rim_r) * 0.25, -w * 0.97), (rim_r + (outer_r - rim_r) * 0.7, -w), (outer_r - 0.018, -w * 0.96),
                (outer_r - 0.004, -w * 0.82), (outer_r, -w * 0.5), (outer_r, w * 0.5), (outer_r - 0.004, w * 0.82), (outer_r - 0.018, w * 0.96),
                (rim_r + (outer_r - rim_r) * 0.7, w), (rim_r + (outer_r - rim_r) * 0.25, w * 0.97), (rim_r, w * 0.82), (rim_r, -w * 0.82)]

# The site's rim: axle along Z, face towards +Z, outer diameter 1 (models/tools/prep_wheels.py).
bpy.ops.import_scene.gltf(filepath=str(base / wc["rim"]))
rim_parts = [o for o in bpy.context.selected_objects if o.type == "MESH"]
for o in rim_parts:
    mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw; bake(o, Matrix.Identity(4))
for o in [o for o in bpy.data.objects if o.type == "EMPTY"]:
    bpy.data.objects.remove(o, do_unlink=True)
rim_mat = material("Rim", (0.72, 0.73, 0.75), 0.3, 1.0)
for o in rim_parts:
    o.data.materials.clear(); o.data.materials.append(rim_mat)

for corner, (disc, c) in sorted(hubs.items()):
    left = corner.endswith("L")
    side = 1 if left else -1
    hub = Vector((c.x, side * wc["trackHalfM"], c.z))
    parts = []
    # tyre (axle along Y)
    t = lathe(corner + "_tyre", tyre_profile); t.data.materials.append(tyre_mat); t.location = hub; parts.append(t)
    # rim: scale to size, face outwards
    for rp in rim_parts:
        r = rp.copy(); r.data = rp.data.copy(); bpy.context.scene.collection.objects.link(r)
        r.data.transform(Matrix.Rotation(math.radians(-90 if left else 90), 4, "X") @ Matrix.Scale(2 * rim_r * 1.02, 4))
        r.location = hub + Vector((0, side * 0.01, 0)); parts.append(r)
    # the model's own disc, recoloured, plus a simple caliper gripping it towards the back
    disc.data.materials.clear(); disc.data.materials.append(disc_mat); parts.append(disc)
    dlo, dhi = bounds([disc]); disc_r = (dhi.z - dlo.z) / 2
    bpy.ops.mesh.primitive_cube_add(size=1)
    cal = bpy.context.active_object; cal.name = corner + "_caliper"
    cal.scale = (0.11, 0.06, 0.16); bpy.ops.object.transform_apply(scale=True)
    bevel = cal.modifiers.new("round", "BEVEL"); bevel.width = 0.015; bevel.segments = 3
    bpy.ops.object.modifier_apply(modifier="round")
    ang = math.radians(35)  # behind the axle, a little above it
    cal.location = Vector((c.x - math.cos(ang) * disc_r * 0.82, (dlo.y + dhi.y) / 2 + side * 0.035, c.z + math.sin(ang) * disc_r * 0.82))
    cal.rotation_euler = (0, -ang + math.pi / 2, 0)
    cal.data.materials.append(cal_mat); parts.append(cal)
    bpy.context.view_layer.update()  # so matrix_world includes the caliper's new position before baking
    for p in parts:
        bake(p, Matrix.Identity(4))
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = t
    bpy.ops.object.join()
    g = bpy.context.view_layer.objects.active; g.name = corner
    g.data.transform(Matrix.Translation(-hub)); g.location = hub
    print(f"{corner}: hub at ({hub.x:.3f}, {hub.y:.3f}, {hub.z:.3f})")
for o in rim_parts:
    bpy.data.objects.remove(o, do_unlink=True)

# ---------- 5. save ----------
allm = [o for o in bpy.data.objects if o.type == "MESH"]
lo, hi = bounds(allm)
print(f"Car size (m): length {hi.x - lo.x:.3f}  width {hi.y - lo.y:.3f}  height {hi.z - lo.z:.3f}")
for o in bpy.data.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", export_yup=True, export_apply=True)
tris = sum(len(p.vertices) - 2 for o in allm for p in o.data.polygons)
print(f"Saved {out.name}: {len(allm)} objects, about {tris} triangles, {out.stat().st_size / 1e6:.1f} MB")
