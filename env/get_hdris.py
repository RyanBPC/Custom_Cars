"""Downloads the 3D view's real-world settings (360° HDR photos, CC0) from Poly Haven into env/.

    python env/get_hdris.py

They're kept out of git because they're large (~7 MB each). Standard library only.
"""
import json
import pathlib
import urllib.request

here = pathlib.Path(__file__).resolve().parent
envs = {k: v for k, v in json.loads((here / "environments.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}
headers = {"User-Agent": "customizacions-student-project"}
for env_id, e in envs.items():
    target = here / f"{e['polyhaven']}.hdr"
    if target.exists():
        print("already have", target.name)
        continue
    with urllib.request.urlopen(urllib.request.Request(f"https://api.polyhaven.com/files/{e['polyhaven']}", headers=headers)) as r:
        url = json.load(r)["hdri"]["2k"]["hdr"]["url"]
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers)) as r:
        target.write_bytes(r.read())
    print(f"downloaded {target.name} ({target.stat().st_size / 1e6:.1f} MB) for {env_id}")
