"""Fits aero parts to a car model, so the site only has to switch them on.

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \
        --python models/tools/prep_aero.py -- <folder with downloaded wing/spoilerpack/exhaust .glb> models/golf.glb models/aero/golf [preview.png]

Per-car positions are in CARS below (keyed by the car file's name).

Downloaded parts (CC BY, see models/aero/sources.json) are scaled and placed against the car's real bodywork
(found with ray casts): the GT wing's legs stand on the tailgate, the lip and ducktail sit on the roof spoiler,
the exhaust tips come out at the rear corners. The front splitter, side skirts and rear diffuser are modelled
here, traced from the bumper and sill shapes, so they fit this car exactly. Each part is saved in the car's own
coordinates. Optional last argument: a preview render of everything fitted.
"""
import bpy, bmesh, sys, pathlib, math, mathutils
from mathutils.bvhtree import BVHTree

args = sys.argv[sys.argv.index("--") + 1:]
src, car_file, out = pathlib.Path(args[0]), pathlib.Path(args[1]), pathlib.Path(args[2])
preview = pathlib.Path(args[3]) if len(args) > 3 else None
out.mkdir(parents=True, exist_ok=True)
V = mathutils.Vector

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(car_file))
car_objs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
def in_wheel(o):
    while o:
        if o.name.startswith("Wheel_"): return True
        o = o.parent
    return False
body = [o for o in car_objs if not in_wheel(o) and not o.data.materials[:1] == [None] and not any(m and m.name.startswith("Glass") for m in o.data.materials)]
glass = [o for o in car_objs if any(m and m.name.startswith("Glass") for m in o.data.materials)]
dg = bpy.context.evaluated_depsgraph_get()
def tree(objs):
    verts, polys = [], []
    for o in objs:
        me = o.evaluated_get(dg).to_mesh(); base = len(verts)
        verts += [o.matrix_world @ v.co for v in me.vertices]
        polys += [[base + i for i in p.vertices] for p in me.polygons]
        o.evaluated_get(dg).to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)
BODY, ALL = tree(body), tree(body + glass)
def hit(o, d, t=BODY):
    loc, n, i, dist = t.ray_cast(V(o), V(d).normalized(), 10)
    return loc
# Blender axes for this car: +X front, +Y left, +Z up (glTF export turns them back into the site's axes).
wheels = [o for o in bpy.context.scene.objects if o.name.startswith("Wheel_")]
wx = sorted({round(o.matrix_world.translation.x, 2) for o in wheels})
rear_wheel_x, front_wheel_x = wx[0], wx[-1]
print("wheels at x", wx)
# Where things go on each car (Blender x, metres). Hatchbacks put the lip and ducktail on the roof spoiler;
# saloons and coupés on the boot lid's back edge. The GT wing's feet stand on the tailgate or boot lid at tail_x.
CARS = {
    "golf":    dict(front_probe_x=2.0,  rear_probe_x=-1.9, tail_x=-2.03, edge_x=-1.80, lip_span=1.18, wing_span=1.42),
    "bmw440i": dict(front_probe_x=2.15, rear_probe_x=-2.2, tail_x=-2.06, edge_x=-2.14, lip_span=1.22, wing_span=1.45,
                    tip=(-2.29, 0.42, 0.315)),
    "fiesta":  dict(front_probe_x=1.8,  rear_probe_x=-1.8, tail_x=-1.86, edge_x=-1.46, lip_span=1.08, wing_span=1.32,
                    tip=(-1.88, 0.275, 0.27)),  # the car's own tips (the search finds the diffuser edge instead)
}
C = CARS[car_file.stem]

def new_mesh(name, verts, faces, mat):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.materials.append(mat); return ob
def material(name, colour, metal=0.0, rough=0.4):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]; b.inputs["Base Color"].default_value = (*colour, 1); b.inputs["Metallic"].default_value = metal; b.inputs["Roughness"].default_value = rough
    return m
CARBON = material("Carbon", (0.02, 0.02, 0.022), 0.1, 0.3)   # the site swaps in its carbon weave
BLACK = material("Trim_Black", (0.01, 0.01, 0.012), 0.0, 0.35)
def finish(ob, bevel=0.003, uv=True):
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True)
    if bevel:
        m = ob.modifiers.new("bevel", "BEVEL"); m.width = bevel; m.segments = 2; m.limit_method = "ANGLE"
        bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.ops.object.shade_auto_smooth(angle=math.radians(35))
    if uv:
        bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02); bpy.ops.object.mode_set(mode="OBJECT")
def export(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(out / f"{name}.glb"), export_format="GLB", use_selection=True, export_apply=True, export_image_format="JPEG")
    print("saved", name, sum(len(o.data.polygons) for o in objs), "faces")

def import_parts(file, keep):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=str(file))
    new = [o for o in bpy.context.scene.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH" and keep(o.name)]
    for o in new:
        if o not in meshes and o.type == "MESH": bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes: o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM"); bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(meshes) > 1: bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    for o in list(bpy.context.scene.objects):
        if o.type == "EMPTY" and o in new: bpy.data.objects.remove(o, do_unlink=True)
    return ob
def bounds(ob):
    vs = [ob.matrix_world @ v.co for v in ob.data.vertices]
    return V([min(v[i] for v in vs) for i in range(3)]), V([max(v[i] for v in vs) for i in range(3)])
def place(ob, M):
    ob.data.transform(M); ob.data.update()

# ---------- front splitter: follows the bumper's bottom edge ----------
ys = [i / 20 * 1.6 - 0.8 for i in range(21)]
fb_z = min(z for z in [h.z for y in (-0.3, 0, 0.3) for h in [hit((C["front_probe_x"], y, -1), (0, 0, 1))] if h] or [0.2])
front = []
for y in ys:
    h = hit((4, y, fb_z + 0.025), (-1, 0, 0))
    if h: front.append((y, h.x))
z0, t = fb_z - 0.004, 0.014
outer = [V((x + 0.045, y, z0)) for y, x in front]; inner = [V((x - 0.16, y, z0)) for y, x in front]
verts = [p for p in outer] + [p for p in inner] + [p - V((0, 0, t)) for p in outer] + [p - V((0, 0, t)) for p in inner]
n = len(front); faces = []
for i in range(n - 1):
    a, b, c, d = i, i + 1, n + i + 1, n + i
    faces += [(a, b, c, d), (2 * n + d, 2 * n + c, 2 * n + b, 2 * n + a), (a, 2 * n + a, 2 * n + b, b), (d, c, 2 * n + c, 2 * n + d)]
faces += [(0, n, 3 * n, 2 * n), (n - 1, 2 * n - 1 + 2 * n, 3 * n - 1, 2 * n - 1)[::-1]]
splitter = new_mesh("Splitter", verts, faces, CARBON); finish(splitter, 0.003)
export([splitter], "splitter")

# ---------- side skirts: an L-shaped strip under each sill ----------
skirt_objs = []
xs = [rear_wheel_x + 0.40 + i / 24 * (front_wheel_x - rear_wheel_x - 0.80) for i in range(25)]
for k in (1, -1):
    rings = []
    for x in xs:
        under = hit((x, k * 0.78, -1), (0, 0, 1)); zb = under.z if under else 0.22
        side = hit((x, k * 3, zb + 0.04), (0, -k, 0)); ys_ = abs(side.y) if side else 0.86
        prof = [(ys_ - 0.06, zb + 0.012), (ys_ + 0.012, zb + 0.012), (ys_ + 0.024, zb - 0.02), (ys_ + 0.018, zb - 0.058), (ys_ - 0.06, zb - 0.05)]
        rings.append([V((x, k * py, pz)) for py, pz in prof])
    m = len(rings[0]); verts = [p for r in rings for p in r]; faces = []
    for i in range(len(rings) - 1):
        for j in range(m):
            a, b = i * m + j, i * m + (j + 1) % m; c, d = b + m, a + m
            faces.append((a, b, c, d) if k > 0 else (d, c, b, a))
    faces.append(tuple(range(m)) if k < 0 else tuple(reversed(range(m))))
    last = (len(rings) - 1) * m; faces.append(tuple(range(last, last + m)) if k > 0 else tuple(reversed(range(last, last + m))))
    ob = new_mesh(f"Skirt_{'L' if k > 0 else 'R'}", verts, faces, CARBON); finish(ob, 0.004); skirt_objs.append(ob)
export(skirt_objs, "skirts")

# ---------- rear diffuser: a plate that rises towards the back, with fins ----------
rb = [h.z for y in (-0.3, 0, 0.3) for h in [hit((C["rear_probe_x"], y, -1), (0, 0, 1))] if h]
rb_z = min(rb) if rb else 0.3
back = hit((-4, 0, rb_z + 0.03), (1, 0, 0)); bx = back.x if back else -2.1
W, L = 0.55, 0.36
dverts = []; dfaces = []
def quad_strip(pts_top, thick, mat_name):
    pass
plate = [V((bx + 0.02, -W, rb_z - 0.005)), V((bx + 0.02, W, rb_z - 0.005)), V((bx + L, W, rb_z - 0.035)), V((bx + L, -W, rb_z - 0.035))]
verts = plate + [p - V((0, 0, 0.012)) for p in plate]
faces = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
diff = new_mesh("Diffuser", verts, faces, CARBON); parts = [diff]
for i in range(5):
    y = -W * 0.8 + i * (W * 1.6 / 4)
    fin = [V((bx + 0.01, y, rb_z - 0.01)), V((bx + L - 0.02, y, rb_z - 0.035)), V((bx + L - 0.05, y, rb_z - 0.075)), V((bx + 0.01, y, rb_z - 0.05))]
    fv = [p + V((0, 0.005, 0)) for p in fin] + [p - V((0, 0.005, 0)) for p in fin]
    parts.append(new_mesh(f"Fin{i}", fv, [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], CARBON))
for p in parts: finish(p, 0.002)
export(parts, "diffuser")

# ---------- GT wing: legs on the tailgate, blade at roof height ----------
glass_lo = hit((-1.95, 0, 3), (0, 0, -1), ALL)
tail_x = C["tail_x"]
tail = hit((tail_x, 0.45, 3), (0, 0, -1)) or V((tail_x, 0.45, 0.97))
roof_edge = hit((C["edge_x"], 0, 3), (0, 0, -1)) or V((C["edge_x"], 0, 1.34))
wing = import_parts(src / "wing.glb", lambda n: n in ("Object_4", "Object_6", "Object_8", "Object_10", "Object_16", "Object_20", "Object_22", "Object_24", "Object_26"))
lo, hi = bounds(wing); span = hi.x - lo.x
s = C["wing_span"] / span
M = mathutils.Matrix.Rotation(math.radians(90), 4, "Z") @ mathutils.Matrix.Scale(s, 4)   # span across the car, blade behind the legs
place(wing, M)
lo, hi = bounds(wing)
# Feet (lowest points) on the tailgate at tail_x; legs' front edge there.
feet_x = max(v.co.x for v in wing.data.vertices if v.co.z < lo.z + 0.02)
place(wing, mathutils.Matrix.Translation(V((tail_x + 0.03 - feet_x, -(lo.y + hi.y) / 2, tail.z - lo.z - 0.004))))
lo, hi = bounds(wing); print("wing top", round(hi.z, 3), "roof edge", round(roof_edge.z, 3))
export([wing], "wing")

# ---------- lip and ducktail: on the roof spoiler's back edge ----------
pack_names = {"lip": "Cube_Material1_0", "ducktail": "Cube.006_Material1_0"}
for part, nm in pack_names.items():
    ob = import_parts(src / "spoilerpack.glb", lambda n, nm=nm: n == nm)
    lo, hi = bounds(ob); s = C["lip_span"] / (hi.x - lo.x)
    place(ob, mathutils.Matrix.Rotation(math.radians(90), 4, "Z") @ mathutils.Matrix.Scale(s, 4) @ mathutils.Matrix.Translation(-(lo + hi) / 2))
    lo, hi = bounds(ob)
    place(ob, mathutils.Matrix.Translation(V((roof_edge.x - 0.02 - hi.x, 0, roof_edge.z - lo.z - 0.01))))
    finish(ob, 0.004, uv=False)
    export([ob], part)

# ---------- exhaust tips: polished tips with a rolled edge, over the car's own tips (a bit bigger) ----------
CHROME = material("Chrome", (0.95, 0.95, 0.95), 1.0, 0.08)
def lathe(name, prof, centre, mat, segs=48):
    """Spins (radius, x) points round an axle along X at centre."""
    verts, faces = [], []
    for r, dx in prof:
        for j in range(segs):
            a = 2 * math.pi * j / segs
            verts.append(V((centre.x + dx, centre.y + r * math.cos(a), centre.z + r * math.sin(a))))
    for i in range(len(prof) - 1):
        for j in range(segs):
            a, b = i * segs + j, i * segs + (j + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    return new_mesh(name, verts, faces, mat)
def find_tip(k):
    """The car's own tip on this side: the rear-most low trim (not the bumper paint, not our new parts); its middle."""
    dg2 = bpy.context.evaluated_depsgraph_get(); hits = []
    for i in range(41):
        for j in range(31):
            y, z = k * (0.35 + i * 0.01), 0.262 + j * 0.0032
            ok, loc, nrm, idx, ob, M = bpy.context.scene.ray_cast(dg2, V((-4, y, z)), V((1, 0, 0)))
            if not ok or not ob.material_slots: continue
            m = ob.material_slots[ob.data.polygons[idx].material_index].material
            if m and m.name not in ("Paint", "Carbon", "Trim_Black", "Chrome") and loc.z < 0.36: hits.append(loc)
    if not hits: return None
    back = min(h.x for h in hits)
    # Rays that go into the tip's opening travel much deeper than the ones around it: their middle is the centre.
    hole = [h for h in hits if h.x > back + 0.12]
    pts = hole or [h for h in hits if h.x < back + 0.02]
    c = V((back, sum(h.y for h in pts) / len(pts), sum(h.z for h in pts) / len(pts)))
    print("tip", k, "centre", tuple(round(v, 3) for v in c), "from", len(pts), "hole points" if hole else "rim points")
    return c
def tip_parts(k, quad):
    c = V((C["tip"][0], k * C["tip"][1], C["tip"][2])) if "tip" in C else find_tip(k) or V((-2.08, k * 0.55, 0.30))
    out_ = []
    for dy in ([-0.052, 0.052] if quad else [0.0]):
        r = 0.042 if quad else 0.052
        cc = V((c.x, c.y + k * dy, c.z))
        # outer wall (from 10 cm inside the bumper), rolled lip just behind the bumper, inner wall going back into the pipe.
        # dx is towards the front of the car, so the pipe sits inside and only the lip shows.
        prof = [(r, 0.10), (r, -0.004), (r + 0.004, -0.010), (r - 0.002, -0.016), (r - 0.007, -0.010), (r - 0.007, 0.08)]
        out_.append(lathe("Tip", prof, cc, CHROME))
        disc = lathe("TipInside", [(r - 0.007, 0.03), (0.0, 0.03)], cc, BLACK)
        out_.append(disc)
    return out_
for name, quad in (("exhaust", False), ("exhaust-quad", True)):
    objs = [o for k in (1, -1) for o in tip_parts(k, quad)]
    for o in objs: finish(o, 0, uv=False)
    export(objs, name)
    if preview is None or name == "exhaust-quad":
        for o in objs: bpy.data.objects.remove(o, do_unlink=True)

if preview:
    for o in bpy.context.scene.objects: o.hide_render = False
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); bpy.context.collection.objects.link(cam)
    cam.location = (-6.2, -4.6, 2.2); cam.rotation_euler = (math.radians(76), 0, math.radians(-53)); bpy.context.scene.camera = cam
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); bpy.context.collection.objects.link(sun); sun.rotation_euler = (0.6, 0.2, -0.8)
    sc = bpy.context.scene; sc.render.engine = "BLENDER_WORKBENCH"; sc.render.resolution_x, sc.render.resolution_y = 1100, 700
    sc.display.shading.light = "STUDIO"; sc.display.shading.color_type = "MATERIAL"
    sc.render.filepath = str(preview); bpy.ops.render.render(write_still=True)
    cam.location = (-5.0, -2.6, 0.55); cam.rotation_euler = (math.radians(88), 0, math.radians(-62))
    sc.render.filepath = str(preview).replace(".png", "_rearlow.png"); bpy.ops.render.render(write_still=True)
    cam.location = (5.6, -3.4, 1.0); cam.rotation_euler = (math.radians(82), 0, math.radians(58))
    sc.render.filepath = str(preview).replace(".png", "_front.png"); bpy.ops.render.render(write_still=True)
    print("preview", preview)
