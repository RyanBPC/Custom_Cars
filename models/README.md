# 3D car models

The 3D view loads `models/<car id>.json` for the chosen car. If that file doesn't exist, it shows a simple stand-in shape.

## Cars so far

| Car | Model | Licence |
|---|---|---|
| Volkswagen Golf GTI (`golf`) | [Volkswagen Golf 8. GTI (A8)](https://sketchfab.com/3d-models/volkswagen-golf-8-gti-a8-e87d7c0f8937481db236529beb5ecab7) by Mona x Supercars (@Car2022) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Changes: resized, parts renamed, windows split front/rear, calipers separated from the wheel rims, wheels separated, recoloured live by the site. |
| BMW 440i M Sport Coupé (`bmw440i`) | [BMW 4 Series F32 2013-2020](https://sketchfab.com/3d-models/bmw-4-series-f32-2013-2020-8db7d0707a6b4ffc85f81c5e7feb0633) by Merc_TV (@szymonpasterczyk) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Changes: duplicate part versions removed, one paint, cabin mirrored to right-hand drive, wheels, tyres and calipers added. Prepared with `tools/prep_game_model.py` and `bmw440i-prep.json`. |
| Ford Fiesta 1.4 Zetec Mk6 (`fiesta`) | [Ford Fiesta Mk5](https://sketchfab.com/3d-models/ford-fiesta-mk5-f3a9d5d1fc9142d297f8d3c4d9b91431) by Ruletă (@romanian_guy_0069) (it's the UK Mk6) | [CC BY 4.0](http://creativecommons.org/licenses/by/4.0/). Changes: resized to a real Mk6, wheels, tyres, discs and calipers added, lights split out of the shared texture, number plate blanked, dashboard mirrored to right-hand drive. Prepared with `tools/prep_game_model.py` and `fiesta-prep.json` (download the glTF version into `source/fiesta-rg/`). Very likely from a mobile driving game: local use only. |

**Provenance:** the BMW's uploader says they import cars from driving games (BeamNG.drive, Assetto Corsa, GTA), so it's very likely a game asset. The Golf model's uploader has hundreds of models across many brands, a pattern that often means assets copied from a game. If so, the CC BY licence isn't valid. It's fine for local learning, but **don't publish it**: before the site goes public, replace it with a model whose creator shows their own work, or a paid model with a clear licence.

**The `.glb` files are not in git** (see `.gitignore`), for that reason and because they're large. They live in this folder (backed up by OneDrive). To rebuild on another computer: download the model from the link above into `source/`, then run the script below.

## Files

- `source/` holds the model exactly as downloaded (kept so the prepared file can be rebuilt).
- `<car>-prep.json` holds the settings for the preparation script: real length, which way the car faces, and which part is which.
- `<car>.glb` is the prepared model the site loads.
- `<car>.json` tells the site which file to load, who to credit, and which mods the 3D view can't show yet.
- `tools/inspect.html` is a developer page (not part of the site) that shows every part of a model on its own, to work out which part is which. Open `http://127.0.0.1:8000/models/tools/inspect.html?file=source/golf-sketchfab.glb` with `start.bat` running.
- `tools/prep_model.py` is the Blender script that prepares a model.

## Adding a car

1. Find a downloadable model with a licence that allows changes (CC BY, CC BY-NC or CC0; not ND). Avoid anything described as taken from a game, and check the uploader's profile: hundreds of cars across many brands is a red flag; a smaller portfolio with work-in-progress shots is a good sign. Aim for under ~150k triangles and ~10 MB. Download the **GLB** version.
2. Save it as `models/source/<car>-sketchfab.glb` and open `tools/inspect.html` on it to see which `Object_N` is the paint, glass, lights and wheel parts.
3. Copy `golf-prep.json` to `<car>-prep.json` and fill in the length (metres), the front direction, and the part roles.
4. Run the script (Blender 5.2 is installed):

   ```bash
   "C:/Program Files/Blender Foundation/Blender 5.2/blender.exe" --background --factory-startup --python models/tools/prep_model.py -- models/<car>-prep.json
   ```

   Check its summary: the size should match the real car, and all four wheels should be found.
5. Write `models/<car>.json` (copy `golf.json`) with the credit, and check the car in the 3D view.

## Standard names the site looks for

Materials: `Paint`, `Glass_Front`, `Glass_Rear`, `Lens_Front`, `Lens_Rear`, `Rim`, `Caliper`. Top-level groups: `Wheel_FL`, `Wheel_FR`, `Wheel_RL`, `Wheel_RR`, with their origin at the hub. The car faces +X, is in metres, and sits on the ground.

## Calipers painted into the wheel texture

Some models paint the brake calipers onto the wheel rim's texture instead of making them a separate part. `splitByColour` in the prep JSON moves every rim face whose texture is (for example) red into its own `Caliper` material, so the site can recolour it. Check the result in `tools/inspect.html`: any other red on the wheel, like a centre-cap logo, gets moved too.
