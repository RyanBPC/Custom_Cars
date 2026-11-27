"""Downloads sharp 360° backgrounds for the 3D view's "360°" mode (Poly Haven tonemapped JPGs, CC0) and
shrinks them to 8192x4096 with Blender. Kept out of git (env/sky/).

    python env/get_skies.py
"""
import json
import pathlib
import subprocess
import urllib.request

here = pathlib.Path(__file__).resolve().parent
out_dir, src_dir = here / "sky", here / "sky" / "source"
src_dir.mkdir(parents=True, exist_ok=True)
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
headers = {"User-Agent": "custom-cars-student-project"}
envs = {k: v for k, v in json.loads((here / "environments.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}

for env_id, e in envs.items():
    out = out_dir / f"{env_id}.jpg"
    if out.exists():
        print("already have", out.name)
        continue
    src = src_dir / f"{e['polyhaven']}.jpg"
    if not src.exists():
        with urllib.request.urlopen(urllib.request.Request(f"https://api.polyhaven.com/files/{e['polyhaven']}", headers=headers)) as r:
            url = json.load(r)["tonemapped"]["url"]
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers)) as r:
            src.write_bytes(r.read())
    script = ("import bpy; img = bpy.data.images.load(r'%s'); img.scale(8192, 4096); img.filepath_raw = r'%s'; "
              "img.file_format = 'JPEG'; bpy.context.scene.render.image_settings.quality = 85; img.save()") % (src, out)
    subprocess.run([BLENDER, "--background", "--factory-startup", "--python-expr", script], check=True, capture_output=True)
    print(f"{env_id}: {out.name} {out.stat().st_size / 1e6:.1f} MB")
