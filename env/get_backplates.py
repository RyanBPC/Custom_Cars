"""Downloads the 3D view's background photos ("backplates", CC0) from Poly Haven and makes site-sized copies.

    python env/get_backplates.py

Each setting in env/environments.json can name a "backplate": [Poly Haven HDRI id, photo number]. The full
photo goes to env/backplates/source/ (kept out of git); a 2560-pixel-wide copy for the site is made with
Blender (installed) into env/backplates/. The lens focal length is read from the photo so the 3D camera
can match its perspective, and printed for environments.json.
"""
import json
import math
import pathlib
import struct
import subprocess
import urllib.request

here = pathlib.Path(__file__).resolve().parent
out_dir, src_dir = here / "backplates", here / "backplates" / "source"
src_dir.mkdir(parents=True, exist_ok=True)
BLENDER = r"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
headers = {"User-Agent": "custom-cars-student-project"}
envs = {k: v for k, v in json.loads((here / "environments.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}


def exif_focal_35mm(data):
    """Reads the 35 mm-equivalent focal length (or plain focal length) from a JPEG's EXIF block."""
    i = 2
    while i < len(data) - 4:
        marker, length = struct.unpack(">HH", data[i:i + 4])
        if marker == 0xFFE1 and data[i + 4:i + 10] == b"Exif\0\0":
            t = data[i + 10:i + 2 + length]
            e = "<" if t[:2] == b"II" else ">"
            def ifd(off):
                n = struct.unpack(e + "H", t[off:off + 2])[0]
                return {struct.unpack(e + "H", t[off + 2 + k * 12:off + 4 + k * 12])[0]: t[off + 2 + k * 12:off + 14 + k * 12] for k in range(n)}
            tags = ifd(struct.unpack(e + "I", t[4:8])[0])
            sub = ifd(struct.unpack(e + "I", tags[0x8769][8:12])[0]) if 0x8769 in tags else {}
            if 0xA405 in sub:
                return struct.unpack(e + "H", sub[0xA405][8:10])[0], True
            if 0x920A in sub:
                off = struct.unpack(e + "I", sub[0x920A][8:12])[0]
                num, den = struct.unpack(e + "II", t[off:off + 8])
                return num / den, False
            return None, False
        i += 2 + length
    return None, False


for env_id, e in envs.items():
    if "backplate" not in e:
        continue
    hdri, num = e["backplate"]
    src = src_dir / f"{hdri}_{num}.jpg"
    if not src.exists():
        with urllib.request.urlopen(urllib.request.Request(f"https://api.polyhaven.com/files/{hdri}", headers=headers)) as r:
            url = json.load(r)["backplates"][num]["jpg_plain"]["url"]
        with urllib.request.urlopen(urllib.request.Request(url, headers=headers)) as r:
            src.write_bytes(r.read())
        print(f"downloaded {src.name} ({src.stat().st_size / 1e6:.1f} MB)")
    focal, is35 = exif_focal_35mm(src.read_bytes())
    hfov = 2 * math.degrees(math.atan(36 / (2 * focal))) if focal and is35 else None
    out = out_dir / f"{env_id}.jpg"
    if not out.exists():
        script = ("import bpy; img = bpy.data.images.load(r'%s'); w, h = img.size; img.scale(2560, round(2560 * h / w)); "
                  "img.filepath_raw = r'%s'; img.file_format = 'JPEG'; bpy.context.scene.render.image_settings.quality = 88; img.save()") % (src, out)
        subprocess.run([BLENDER, "--background", "--factory-startup", "--python-expr", script], check=True, capture_output=True)
    print(f"{env_id}: {out.name} {out.stat().st_size / 1e6:.1f} MB, focal {focal} mm{' (35mm equiv)' if is35 else ''}, horizontal field of view {hfov and round(hfov, 1)}°")
