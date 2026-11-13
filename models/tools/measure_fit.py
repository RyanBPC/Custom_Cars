"""Measures a prepared car model for the "fit" block in models/<car>.json (where add-on parts and the interior
camera go). Runs inside Blender and prints the JSON:

    "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup \
        --python models/tools/measure_fit.py -- models/bmw440i.glb

Site coordinates: metres, front is +x, up is +y, the car's right side is +z (Blender: x, z, -y).
Rays are cast at the body (wheels left out) to find the bumpers, sills, roof, bonnet and rear window.
"""
import json
import sys

import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

src = sys.argv[sys.argv.index("--") + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
body = [o for o in bpy.data.objects if o.type == "MESH" and not any(p.name.startswith("Wheel_") for p in [o, o.parent] if p)]
mat_of = lambda o: o.data.materials[0].name if o.data.materials else ""
dg = bpy.context.evaluated_depsgraph_get()


def tree(objs):
    verts, polys = [], []
    for o in objs:
        base = len(verts)
        verts += [o.matrix_world @ v.co for v in o.data.vertices]
        polys += [[base + i for i in p.vertices] for p in o.data.polygons]
    return BVHTree.FromPolygons(verts, polys)


shell = [o for o in body if mat_of(o) not in ("Glass_Front", "Glass_Rear") and not o.hide_render]
T = tree(shell)
pts = [o.matrix_world @ v.co for o in shell for v in o.data.vertices]
r3 = lambda v: round(v, 2)
front_x, rear_x = max(p.x for p in pts), min(p.x for p in pts)
top = max(p.z for p in pts)


def down(x, y):  # highest body surface at (x, y), Blender coords
    hit = T.ray_cast(Vector((x, y, top + 1)), Vector((0, 0, -1)))
    return hit[0].z if hit[0] else None


def side(x, z):  # outermost body surface on the left at (x, z)
    hit = T.ray_cast(Vector((x, 3, z)), Vector((0, -1, 0)))
    return hit[0].y if hit[0] else None


def up(x, y):
    hit = T.ray_cast(Vector((x, y, -1)), Vector((0, 0, 1)))
    return hit[0].z if hit[0] else None


# bumpers' lowest edges, sills, body side
front_bottom = min(p.z for p in pts if p.x > front_x - 0.25 and abs(p.y) < 0.6)
rear_bottom = min(p.z for p in pts if p.x < rear_x + 0.25 and abs(p.y) < 0.6)
side_z = max(s for s in (side(x, 0.6) for x in (-0.6, -0.3, 0, 0.3)) if s)
sill = min(z for z in (up(x, side_z - 0.08) for x in (-0.6, -0.3, 0, 0.3)) if z)
# roof: where the profile along the centre line is within 7 cm of the top
xs = [front_x - i * 0.02 for i in range(int((front_x - rear_x) / 0.02))]
prof = [(x, down(x, 0)) for x in xs]
prof = [(x, z) for x, z in prof if z]
roof_top = max(z for _, z in prof)
roof = [x for x, z in prof if z > roof_top - 0.07]
roof_half = max(y for y in [i * 0.02 for i in range(60)] if (down((max(roof) + min(roof)) / 2, y) or 0) > roof_top - 0.07)
# bonnet: from the front edge back to the windscreen base (where the profile starts climbing steeply)
bon = [(x, z) for x, z in prof if x > 0.4]
ws = next(x for x, z in sorted(prof, key=lambda p: -p[0]) if x < front_x - 0.6 and z > (down(x - 0.1, 0) or 0) - 0.05 and (down(x - 0.1, 0) or 0) - z > 0.04)
bonnet_x0, bonnet_x1 = ws + 0.08, front_x - 0.1
bonnet_pts = [[r3(x), r3(down(x, 0))] for x in [bonnet_x0 + (bonnet_x1 - bonnet_x0) * t for t in (0.08, 0.3, 0.52, 0.74, 0.9)]]
bonnet_half = max(y for y in [i * 0.02 for i in range(60)] if (down((bonnet_x0 + bonnet_x1) / 2, y) or 0) > roof_top - 0.75)
# rear window: the rear glass part nearest the centre line
rg = [o for o in body if mat_of(o) == "Glass_Rear"]
rgp = [o.matrix_world @ v.co for o in rg for v in o.data.vertices if abs((o.matrix_world @ v.co).y) < 0.3]
rgp = [p for p in rgp if p.x < min(roof) + 0.05]
rg_top = max(rgp, key=lambda p: p.z); rg_bot = min(rgp, key=lambda p: p.z)
rg_half = max(abs((o.matrix_world @ v.co).y) for o in rg for v in o.data.vertices if (o.matrix_world @ v.co).x < min(roof))
# exhaust tips: the chrome bits furthest back
tips = [o.matrix_world @ v.co for o in body if "chrome" in mat_of(o).lower() for v in o.data.vertices if (o.matrix_world @ v.co).x < rear_x + 0.15]
ex = (sum(p.x for p in tips) / len(tips), sum(p.z for p in tips) / len(tips), max(abs(p.y) for p in tips) - 0.05) if tips else (rear_x + 0.05, 0.3, 0.5)
fit = {
    "_about": "Measured with models/tools/measure_fit.py (metres, front is +x, ground y=0). Used to place add-on parts.",
    "frontX": r3(front_x), "rearX": r3(rear_x), "frontBottomY": r3(front_bottom), "rearBottomY": r3(rear_bottom),
    "sideZ": r3(side_z), "sillY": r3(sill),
    "roof": {"x0": r3(min(roof)), "x1": r3(max(roof)), "y": r3(roof_top), "halfW": r3(roof_half), "minY": r3(roof_top - 0.07)},
    "roofEdge": {"x": r3(min(roof) - 0.04), "y": r3(down(min(roof) - 0.04, 0))},
    "rearGlass": {"top": [r3(rg_top.x), r3(rg_top.z)], "bottom": [r3(rg_bot.x), r3(rg_bot.z)], "halfW": r3(rg_half)},
    "bonnet": {"x0": r3(bonnet_x0), "x1": r3(bonnet_x1), "minY": r3(min(p[1] for p in bonnet_pts) - 0.05), "halfW": r3(bonnet_half), "pts": bonnet_pts},
    "exhaust": {"x": r3(ex[0]), "y": r3(ex[1]), "z": r3(ex[2])},
}
print("FIT " + json.dumps(fit))
