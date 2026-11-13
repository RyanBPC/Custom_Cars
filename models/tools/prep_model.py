"""Prepares a downloaded car model for the site's 3D view. Runs inside Blender (no clicking needed):

    blender --background --python models/tools/prep_model.py -- models/golf-prep.json

The JSON file says where the model is, how long the real car is, which way it faces, and which part is
which (paint, glass, lights, wheel parts). The script then:
  1. faces the car towards +X, sizes it to real metres, centres it and puts the tyres on the ground
  2. names the materials the site looks for: Paint, Glass_Front, Glass_Rear, Lens_Front, Lens_Rear, Rim, Caliper
  3. splits the windows into front and rear (UK law only allows dark tint on rear windows)
  4. separates the four wheels into Wheel_FL, Wheel_FR, Wheel_RL, Wheel_RR, each turning round its own hub
  5. saves a GLB file the site loads, and prints a summary
"""
import json
import math
import pathlib
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

cfg_path = pathlib.Path(sys.argv[sys.argv.index("--") + 1]).resolve()
cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
base = cfg_path.parent
src, out = base / cfg["source"], base / cfg["output"]

# ---------- 1. load and tidy ----------
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(src))
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
for o in meshes:  # keep each part where it is, but drop the importer's parent empties
    mw = o.matrix_world.copy()
    o.parent = None
    o.matrix_world = mw
for o in [o for o in bpy.data.objects if o.type != "MESH"]:
    bpy.data.objects.remove(o, do_unlink=True)


def apply_matrix(o, m):
    o.data.transform(m @ o.matrix_world)
    o.matrix_world = Matrix.Identity(4)


for o in meshes:
    apply_matrix(o, Matrix.Identity(4))


def bounds(objs):
    pts = [o.matrix_world @ v.co for o in objs for v in o.data.vertices]
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi


# Face +X: rotate about the vertical axis so the configured "front" direction points along +X.
turn = {"+X": 0, "+Y": -90, "-X": 180, "-Y": 90}[cfg["front"]]
lo, hi = bounds(meshes)
centre = (lo + hi) / 2
length_axis = 1 if cfg["front"] in ("+Y", "-Y") else 0
scale = cfg["lengthM"] / (hi[length_axis] - lo[length_axis])
m = Matrix.Rotation(math.radians(turn), 4, "Z") @ Matrix.Scale(scale, 4) @ Matrix.Translation(-centre)
for o in meshes:
    apply_matrix(o, m)
lo, hi = bounds(meshes)
for o in meshes:
    apply_matrix(o, Matrix.Translation((0, 0, -lo.z)))  # tyres on the ground
lo, hi = bounds(meshes)
print(f"Car size (m): length {hi.x - lo.x:.3f}  width {hi.y - lo.y:.3f}  height {hi.z - lo.z:.3f}")

by_name = {o.name: o for o in meshes}
roles = cfg["roles"]


def named_material(src_obj, name):
    """Gives an object's (first) material the standard name."""
    mat = src_obj.data.materials[0]
    mat.name = name
    return mat


def split_by_x(obj, rear_name, front_name, threshold_x, rear_mat_name, front_mat_name):
    """Splits a mesh into loose parts and sorts each part to front or rear by where its centre is."""
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.mesh.separate(type="LOOSE")
    parts = [o for o in bpy.context.selected_objects]
    front = [p for p in parts if sum((p.matrix_world @ v.co).x for v in p.data.vertices) / len(p.data.vertices) >= threshold_x]
    rear = [p for p in parts if p not in front]
    result = {}
    for group, name, mat_name in ((front, front_name, front_mat_name), (rear, rear_name, rear_mat_name)):
        if not group:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for p in group:
            p.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        if len(group) > 1:
            bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        joined.name = name
        mat = joined.data.materials[0].copy()
        mat.name = mat_name
        joined.data.materials.clear()
        joined.data.materials.append(mat)
        result[name] = joined
    return result


# ---------- 2. paint, lights ----------
paint_mat = None
for name, role in roles.items():
    o = by_name[name]
    if role == "Paint":
        if paint_mat is None:
            paint_mat = named_material(o, "Paint")
        else:
            o.data.materials.clear()
            o.data.materials.append(paint_mat)
    elif role in ("Lens_Rear", "Lens_Front"):
        named_material(o, role)

# ---------- 3. windows and light covers: front / rear ----------
split_x = cfg.get("glassSplitX", -0.2)  # metres from the car's centre; behind this counts as rear
for name, role in roles.items():
    if role == "Glass":
        split_by_x(by_name[name], "Glass_Rear", "Glass_Front", split_x, "Glass_Rear", "Glass_Front")
    elif role == "LensCovers":
        split_by_x(by_name[name], "LensCover_Rear", "LensCover_Front", 0.0, "Lens_Rear_Cover", "Lens_Front")

# ---------- 3b. parts painted onto another part's texture ----------
# Some models paint e.g. the brake calipers onto the wheel rim's texture. "splitByColour" moves every face
# whose texture colour at its centre is (say) red into its own material, so the site can recolour it.
def texture_sampler(mat):
    nodes = mat.node_tree.nodes if mat and mat.use_nodes else []
    img = next((n.image for n in nodes if n.type == "TEX_IMAGE" and n.image), None)
    if not img:
        return None
    w, h = img.size
    px = list(img.pixels)  # flat RGBA, 0..1, bottom row first
    def sample(u, v):
        x = min(w - 1, max(0, int((u % 1) * w)))
        y = min(h - 1, max(0, int((v % 1) * h)))
        i = (y * w + x) * 4
        return px[i], px[i + 1], px[i + 2]
    return sample


COLOUR_TESTS = {"red": lambda r, g, b: r > 0.35 and r > g * 2 and r > b * 2}
for name, rule in cfg.get("splitByColour", {}).items():
    o = by_name[name]
    sample = texture_sampler(o.data.materials[0])
    test = COLOUR_TESTS[rule["colour"]]
    bm = bmesh.new()
    bm.from_mesh(o.data)
    uv = bm.loops.layers.uv.active
    picked = 0
    for f in bm.faces:
        u = sum(l[uv].uv.x for l in f.loops) / len(f.loops)
        v = sum(l[uv].uv.y for l in f.loops) / len(f.loops)
        f.select = test(*sample(u, v))
        picked += f.select
    bm.to_mesh(o.data)
    bm.free()
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.separate(type="SELECTED")
    bpy.ops.object.mode_set(mode="OBJECT")
    new = next(p for p in bpy.context.selected_objects if p != o)
    new.name = f"{name}_{rule['material']}"
    mat = new.data.materials[0].copy()
    mat.name = rule["material"]
    new.data.materials.clear()
    new.data.materials.append(mat)
    by_name[new.name] = new
    roles[new.name] = rule["role"]
    print(f"Split {picked} {rule['colour']} faces of {name} into {new.name} ({rule['material']})")

# ---------- 4. wheels ----------
wheel_objs = {name: role for name, role in roles.items() if role.startswith("wheel")}
corner_parts = {"Wheel_FL": [], "Wheel_FR": [], "Wheel_RL": [], "Wheel_RR": []}
for name, role in wheel_objs.items():
    o = by_name[name]
    if ":" in role:  # e.g. "wheel:Rim" names this part's material
        named_material(o, role.split(":")[1])
    bpy.ops.object.select_all(action="DESELECT")
    o.select_set(True)
    bpy.context.view_layer.objects.active = o
    bpy.ops.mesh.separate(type="LOOSE")
    for p in list(bpy.context.selected_objects):
        c = sum((p.matrix_world @ v.co for v in p.data.vertices), Vector()) / len(p.data.vertices)
        corner = ("Wheel_F" if c.x >= 0 else "Wheel_R") + ("L" if c.y >= 0 else "R")
        corner_parts[corner].append(p)

for corner, parts in corner_parts.items():
    if not parts:
        print("WARNING: no parts found for", corner)
        continue
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    w = bpy.context.view_layer.objects.active
    w.name = corner
    # Put the wheel's origin at its hub centre, so it can turn and be scaled in place.
    lo_w, hi_w = bounds([w])
    hub = (lo_w + hi_w) / 2
    w.data.transform(Matrix.Translation(-hub))
    w.location = hub
    print(f"{corner}: hub at ({hub.x:.3f}, {hub.y:.3f}, {hub.z:.3f}), diameter {hi_w.z - lo_w.z:.3f} m, parts {len(parts)}")

# ---------- 5. save ----------
for o in bpy.data.objects:
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=str(out), export_format="GLB", export_yup=True, export_apply=True)
tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == "MESH" for p in o.data.polygons)
mats = sorted({m.name for o in bpy.data.objects if o.type == "MESH" for m in o.data.materials if m})
print(f"Saved {out.name}: {len(bpy.data.objects)} objects, about {tris} triangles, {out.stat().st_size / 1e6:.1f} MB")
print("Materials:", ", ".join(mats))
print("Objects:", ", ".join(sorted(o.name for o in bpy.data.objects)))
