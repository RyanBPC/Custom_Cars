# Custom Cars: developer notes

_The older, detailed technical notes. The main README is in the project root._

A car modification studio in the browser. Pick a car (or enter a number plate), describe your build in plain English, and watch the parts go onto the car. Specs, prices and engine sound update as you go, and you can take the build for a virtual test drive.

University of Greenwich prototype by Ryan Carr.

## Open it

**Best: double-click `start.bat`.** It starts a small local server (Python, nothing to install) and opens the site at <http://127.0.0.1:8000>. Keep the black window open while you use the site. This is needed for saved AI renders and for automatic AI renders.

Or:

- **Double-click `index.html`.** It opens in your browser. It needs internet for the fonts; offline it falls back to a plain font.
- **Or run a small local server** (needs Python, which is already installed):

  ```bash
  python -m http.server 8123 --bind 127.0.0.1
  ```

  then open <http://localhost:8123>. This is how the site is tested during development. `--bind 127.0.0.1` keeps it visible to this computer only. If `python` opens the Microsoft Store, use `py` instead.

## What it does

- **AI build studio:** type something like "lower it with 19-inch bronze wheels" and the advisor fits the parts, explains each one and updates the specs.
- **Stock vs your build:** drag across the car to compare.
- **12 UK performance cars**, drawn in code (SVG), with wheels, wraps, spoilers, aero, widebody, tint, smoked lights and more.
- **Specs and build sheet:** power, torque, 0–62, weight, grip and braking, with UK fitted prices.
- **Photo views and AI renders:** switch the studio to **Front photo** or **Side photo** to see a realistic stock picture of the car, pick a setting (London at night, Scottish Highlands, race circuit…), and press **AI render** to see your build on it. See "AI photos" below.
- **3D spin (test):** switch to **3D spin** and drag to turn the car all the way round (or use the arrow keys or ↺ ↻ buttons). Paint and wrap finish, wheels, lowering, calipers, rear tint and smoked lights update live. For now it uses a simple stand-in car shape; real 3D models of each car come next. Needs `start.bat`.
- **Engine sound:** generated live in the browser, changes with the exhaust, intake and tune.
- **Virtual test drive:** hold the throttle (or Space) and time your 0–62.
- **Number plate lookup:** demo plates only for now (try `MV24 GTI`).
- **Price list and journal:** typical UK prices and plain-English guides (tint law, insurance, Stage 1 vs 2).

## How the advisor works

```
your message ──► AI model (when available) ─┐
            └──► keyword parser (fallback) ─┴─► build plan (JSON) ──► sanitize() ──► car, specs, sound
```

The AI never changes the page directly. It only suggests a plan: which parts, which options. `sanitize()` then checks every value against the catalogue before anything is applied. Outside Claude the AI isn't connected yet, so the site uses the built-in keyword parser and says "keyword mode".

## AI photos

- **Stock pictures** are AI-generated, made free in the Gemini app with the prompts in [`photos/README.md`](photos/README.md), and saved as `photos/<car>-front.jpg` and `photos/<car>-side.jpg`.
- **AI render** turns the build sheet into an instruction for an image AI (`js/photo/prompt.js`) and applies it to the stock picture. There are two modes, set in `.env` (copy `.env.example`):
  - `manual` (default, free): the site gives you the stock picture and the instruction to paste into the Gemini app, and you add the result back. With `start.bat` running, results are saved in `renders/` and reused for the same build.
  - `gemini` (automatic, paid, **experimental** until a real render has been tried): the local server sends the picture and instruction to Google's image model with your API key. Google charges per image (about 3p at the time of writing). Check the key for free first with `py server\app.py --check`. `DAILY_RENDER_LIMIT` is the real cap on renders per day. Also add a budget alert in Google Cloud billing, but note that Google budgets only send alerts; they don't stop spending.
- The API key stays in `.env` on this computer. It is never sent to the browser or committed to git.
- `renders/` isn't in git, so renders you make by hand are backed up only by OneDrive.
- Renders are AI impressions, not real photos. The drawing and build sheet stay the exact record of the build.

## Project layout

```
index.html                 page structure; loads the CSS and scripts
css/styles.css             all styles
js/data/cars.js            the 12 cars, demo plates, Autotrader search names
js/data/catalogue.js       parts, options, prices and part descriptions
js/data/content.js         price list and journal text
js/render/colour.js        colour helpers
js/render/car-svg.js       draws each car and its parts
js/perf.js                 performance model
js/state.js                current car/build, saving, input checks
js/studio.js               compare slider, picker, specs, build sheet, plate lookup
js/audio/engine.js         engine sound (Web Audio)
js/audio/rev-demo.js       "Hear stock / Hear your build"
js/drive.js                virtual test drive
js/advisor/local-parser.js keyword advisor
js/advisor/chat.js         advisor chat and applying plans
js/sections.js             garage, price list and journal
js/photo/prompt.js         builds the AI render instruction from the build; settings list
js/photo/photo-view.js     Front/Side photo views and the AI render button
js/spin-view.js            connects the studio to the 3D view and loads it when first needed
js/three/viewer3d.js       the 3D spin view (an ES module; uses three.js)
vendor/three/              three.js 0.186.1 (MIT licence, see vendor/three/LICENSE)
js/main.js                 start-up (loaded last)
server/app.py              local server: serves the site and the AI render API (standard library only)
start.bat                  double-click to run the server and open the site
.env.example               settings template; copy to .env (never committed)
photos/                    stock car pictures + the prompts used to make them
renders/                   saved AI renders (not committed)
baseline/index.html        the original single-file prototype, kept for reference
advisor-notes/             design reviews written during development
```

`.claude/launch.json` holds the preview-server setting that Claude Code uses for testing.

The scripts are plain `<script>` files, not ES modules, so the page still opens with a double-click. They share one scope and must load in the order listed in `index.html`. Because of that, every top-level name must be unique across all files: before adding a new top-level `const` or `function`, search the `js/` folder for the name.

## Known limitations

- The AI advisor only works when the page runs inside Claude. Elsewhere it uses keyword mode.
- Plate lookup uses demo data. A real DVLA lookup gives make, colour and year but not the exact model, and needs a server-side API key.
- Several cars share a body shape (hatch, saloon, coupe, roadster).
- Prices and performance figures are estimates.

## Credits and notes

Car names and figures belong to their manufacturers and are used for identification only. Custom Cars is not affiliated with any manufacturer or with Autotrader. Car artwork is illustrative.
