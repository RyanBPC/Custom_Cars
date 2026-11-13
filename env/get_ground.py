"""Downloads the ground textures (CC0, Poly Haven) laid under the car in the 360° settings into env/ground/.

    python env/get_ground.py

Each setting in environments.json names one under "ground". For each we fetch the 2K colour, bump (normal)
and roughness maps as JPG (~8 MB per texture). Kept out of git. Standard library only.
"""
import json
import pathlib
import urllib.request

here = pathlib.Path(__file__).resolve().parent
out = here / "ground"
out.mkdir(exist_ok=True)
envs = {k: v for k, v in json.loads((here / "environments.json").read_text(encoding="utf-8")).items() if not k.startswith("_")}
headers = {"User-Agent": "customizacions-student-project"}
MAPS = {"diff": "Diffuse", "nor": "nor_gl", "rough": "Rough"}
for asset in sorted({e["ground"]["texture"] for e in envs.values() if e.get("ground")}):
    with urllib.request.urlopen(urllib.request.Request(f"https://api.polyhaven.com/files/{asset}", headers=headers)) as r:
        files = json.load(r)
    for short, key in MAPS.items():
        target = out / f"{asset}_{short}.jpg"
        if target.exists():
            print("already have", target.name)
            continue
        with urllib.request.urlopen(urllib.request.Request(files[key]["2k"]["jpg"]["url"], headers=headers)) as r:
            target.write_bytes(r.read())
        print(f"downloaded {target.name} ({target.stat().st_size / 1e6:.1f} MB)")
