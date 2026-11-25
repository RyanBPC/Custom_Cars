"""Custom Cars local server.

Serves the website at http://127.0.0.1:8000 (this computer only) and adds a small API
for AI photo renders. Uses only Python's standard library: nothing to install.

Render modes (set RENDER_MODE in the .env file):
  manual  (default) - free: the site shows the AI instruction to copy into the Gemini app,
                      and you add the result back. Renders are saved in renders/.
  gemini            - automatic (experimental): calls Google's image model with your API key.
                      Google charges per image. Check your key first, free: py server\\app.py --check
  mock              - for testing: returns the stock photo unchanged, no AI, no cost.

The API key lives only in .env on this computer. It is never sent to the browser.
"""
import base64
import datetime
import hashlib
import http.server
import json
import pathlib
import sys
import threading
import time
import traceback
import urllib.error
import urllib.parse
import urllib.request
import webbrowser

ROOT = pathlib.Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "photos"
RENDERS = ROOT / "renders"
USAGE_FILE = RENDERS / "usage.json"

CAR_IDS = {"golf", "civic", "yaris", "gr86", "supra", "bmw440i", "fiesta", "m3", "m2", "rs3", "a45", "mustang", "c911", "mx5"}  # matches ALL_CARS in js/data/cars.js
ANGLES = {"front", "side"}
ENV_IDS = {"photo", "street-day", "street-night", "forest-day", "forest-night"}  # matches ENVIRONMENTS in js/photo/prompt.js
IMAGE_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
MAX_PROMPT = 2000
MAX_MODS_JSON = 4000
MAX_UPLOAD_BYTES = 15 * 1024 * 1024
API_BASE = "https://generativelanguage.googleapis.com/v1beta"

# Only these top-level files and folders are served. Everything else (.env, server code, git data,
# notes, the baseline copy) stays private, whatever spelling or encoding a request uses.
ALLOWED_TOP = {"index.html", "css", "js", "photos", "renders", "vendor", "models", "env"}


def load_env():
    """Read KEY=value lines from .env (no extra packages needed)."""
    env = {}
    path = ROOT / ".env"
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def env_int(env, name, default):
    try:
        return int(env.get(name, default))
    except ValueError:
        print(f"Warning: {name} in .env should be a whole number; using {default}.")
        return default


ENV = load_env()
MODE = ENV.get("RENDER_MODE", "manual").lower()
if MODE not in {"manual", "gemini", "mock"}:
    print(f"Warning: RENDER_MODE '{MODE}' isn't known; using manual.")
    MODE = "manual"
API_KEY = ENV.get("GEMINI_API_KEY", "")
MODEL = ENV.get("GEMINI_IMAGE_MODEL", "gemini-nano-banana-2.1")
DAILY_LIMIT = env_int(ENV, "DAILY_RENDER_LIMIT", 20)
PORT = env_int(ENV, "PORT", 8000)
ALLOWED_HOSTS = {f"127.0.0.1:{PORT}", f"localhost:{PORT}"}

usage_lock = threading.Lock()
photo_hashes = {}  # (path, size, mtime) -> sha256 of the photo, so photos aren't re-read every request

# ---------- real parts from eBay UK (free eBay developer keys in .env; see docs/EBAY.md) ----------
EBAY_ID = ENV.get("EBAY_CLIENT_ID", "")
EBAY_SECRET = ENV.get("EBAY_CLIENT_SECRET", "")
EBAY_CATEGORY = "131090"  # eBay UK "Vehicle Parts & Accessories"
EBAY_TTL = 6 * 3600       # keep each search's answer for 6 hours (prices and stock change)
ebay_lock = threading.Lock()
ebay_token = {"value": "", "expires": 0.0}
ebay_cache = {}           # search words -> (time, items)


def ebay_get_token():
    """An app-only sign-in token from eBay (lasts about 2 hours, renewed automatically)."""
    with ebay_lock:
        if ebay_token["value"] and time.time() < ebay_token["expires"] - 60:
            return ebay_token["value"]
        auth = base64.b64encode(f"{EBAY_ID}:{EBAY_SECRET}".encode()).decode()
        data = urllib.parse.urlencode({"grant_type": "client_credentials", "scope": "https://api.ebay.com/oauth/api_scope"}).encode()
        req = urllib.request.Request("https://api.ebay.com/identity/v1/oauth2/token", data=data, method="POST",
                                     headers={"Authorization": f"Basic {auth}", "Content-Type": "application/x-www-form-urlencoded"})
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:
                tok = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            print(f"eBay sign-in failed (HTTP {e.code}): {e.read().decode('utf-8', 'replace')[:300]}")
            if e.code >= 500:
                raise ApiError(502, "ebay_failed", "eBay's sign-in is having problems. Try again in a minute.")
            raise ApiError(502, "ebay_keys", "eBay didn't accept the keys in .env. Check EBAY_CLIENT_ID and EBAY_CLIENT_SECRET (production keys).")
        ebay_token["value"] = tok["access_token"]
        ebay_token["expires"] = time.time() + int(tok.get("expires_in", 7200))
        return ebay_token["value"]


def ebay_search(words, limit=3):
    """Top fixed-price listings on eBay UK for these words, as {title, price, image, url, condition}."""
    if not (EBAY_ID and EBAY_SECRET):
        raise ApiError(503, "no_ebay_key", "No eBay keys yet. Add EBAY_CLIENT_ID and EBAY_CLIENT_SECRET to .env (see docs/EBAY.md), then restart start.bat.")
    key = f"{limit}|{words.lower()}"
    hit = ebay_cache.get(key)
    if hit and time.time() - hit[0] < EBAY_TTL:
        return hit[1]

    def search(category):
        params = {"q": words, "limit": str(limit), "filter": "buyingOptions:{FIXED_PRICE},itemLocationCountry:GB"}
        if category:
            params["category_ids"] = category
        req = urllib.request.Request("https://api.ebay.com/buy/browse/v1/item_summary/search?" + urllib.parse.urlencode(params),
                                     headers={"Authorization": f"Bearer {ebay_get_token()}", "X-EBAY-C-MARKETPLACE-ID": "EBAY_GB",
                                              "Accept-Language": "en-GB"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8")).get("itemSummaries", [])

    try:
        found = search(EBAY_CATEGORY) or search(None)
    except urllib.error.HTTPError as e:
        print(f"eBay search failed (HTTP {e.code}): {e.read().decode('utf-8', 'replace')[:300]}")
        if e.code in (401, 403):
            ebay_token["value"] = ""
        raise ApiError(502, "ebay_failed", "eBay didn't answer the search. Try again in a minute.")
    except urllib.error.URLError as e:
        raise ApiError(502, "ebay_offline", f"Couldn't reach eBay ({e.reason}). Check the internet connection.")
    except (TimeoutError, OSError, ValueError) as e:
        # A slow reply (read timeout), a dropped connection or a garbled answer: say so instead of crashing the request.
        print(f"eBay search didn't finish: {e!r}")
        raise ApiError(502, "ebay_offline", "eBay was too slow to answer. Check the internet connection and try again.")
    items = []
    for it in found:
        price, img = it.get("price") or {}, (it.get("image") or it.get("thumbnailImages", [{}])[0] or {}).get("imageUrl", "")
        if not it.get("itemWebUrl") or not price.get("value"):
            continue
        items.append({"title": it.get("title", ""), "price": float(price["value"]), "currency": price.get("currency", "GBP"),
                      "image": img.replace("s-l225", "s-l500"), "url": it["itemWebUrl"], "condition": it.get("condition", "")})
    ebay_cache[key] = (time.time(), items)
    return items


class ApiError(Exception):
    def __init__(self, status, code, message):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message


# ---------- helpers ----------

def stock_photo(car, angle):
    for ext in IMAGE_TYPES:
        p = PHOTOS / f"{car}-{angle}{ext}"
        if p.exists():
            return p
    return None


def photo_hash(photo):
    st = photo.stat()
    k = (str(photo), st.st_size, st.st_mtime_ns)
    if k not in photo_hashes:
        photo_hashes[k] = hashlib.sha256(photo.read_bytes()).hexdigest()
    return photo_hashes[k]


def cache_key(car, angle, env, mods, photo):
    """Name for a saved render. Based on the build itself (not the instruction's wording) and the
    photo's contents, so rewording prompts or OneDrive touching file dates won't lose saved renders.
    Change "v1" only to deliberately start fresh."""
    raw = "|".join(["v1", car, angle, env, json.dumps(mods, sort_keys=True, separators=(",", ":")), photo_hash(photo)])
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24]


def render_url(path):
    # The version number changes when a render is replaced, so browsers never show a stale copy.
    return f"/renders/{path.name}?v={path.stat().st_mtime_ns}"


def cached_render(key):
    for ext in IMAGE_TYPES:
        p = RENDERS / f"{key}{ext}"
        if p.exists():
            return p
    return None


def image_ext(data):
    if data[:3] == b"\xff\xd8\xff":
        return ".jpg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def save_render(key, data):
    ext = image_ext(data)
    if not ext:
        raise ApiError(400, "bad_image", "That file isn't a JPG, PNG or WebP picture.")
    RENDERS.mkdir(exist_ok=True)
    for old in RENDERS.glob(f"{key}.*"):  # replace any earlier render of this build, whatever its type
        old.unlink()
    path = RENDERS / f"{key}{ext}"
    path.write_bytes(data)
    return path


def read_usage():
    today = datetime.date.today().isoformat()
    try:
        data = json.loads(USAGE_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    return today, int(data.get(today, 0))


def change_usage(delta):
    with usage_lock:
        today, used = read_usage()
        if delta > 0 and used >= DAILY_LIMIT:
            raise ApiError(429, "daily_limit", f"Daily render limit reached ({DAILY_LIMIT}). It resets tomorrow, or change DAILY_RENDER_LIMIT in .env.")
        RENDERS.mkdir(exist_ok=True)
        USAGE_FILE.write_text(json.dumps({today: max(0, used + delta)}), encoding="utf-8")


def validate_3d(body):
    """A picture captured from the 3D view: saved by car, view mode, setting, angle (to 5 degrees) and build."""
    car, env, mode, angle, mods, prompt, pitch, zoom = (body.get(k) for k in ("car", "env", "mode", "angle", "mods", "prompt", "pitch", "zoom"))
    if car not in CAR_IDS or env not in ENV_IDS or mode not in ("360", "photo", "inside-driver", "inside-passenger", "inside-rear") or not isinstance(angle, int) or not 0 <= angle < 360:
        raise ApiError(400, "bad_request", "Unknown car, setting, view or angle.")
    if pitch is not None and (not isinstance(pitch, int) or not -90 <= pitch <= 90):
        raise ApiError(400, "bad_request", "Unknown view angle.")
    if zoom is not None and (not isinstance(zoom, int) or not 0 <= zoom <= 100):
        raise ApiError(400, "bad_request", "Unknown zoom.")
    if not isinstance(mods, dict) or len(json.dumps(mods)) > MAX_MODS_JSON:
        raise ApiError(400, "bad_request", "The build is missing or too large.")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > MAX_PROMPT:
        raise ApiError(400, "bad_request", "The AI instruction is missing or too long.")
    model = ROOT / "models" / f"{car}.glb"
    if not model.exists():
        raise ApiError(404, "no_model", "This car has no 3D model yet.")
    parts = ["v1", "3d", car, mode, env, str(round(angle / 5) * 5 % 360), json.dumps(mods, sort_keys=True, separators=(",", ":")), photo_hash(model)]
    if pitch is not None:  # inside the car, looking up or down matters too (outside views keep their old keys)
        parts.append(str(round(pitch / 5) * 5))
    if zoom is not None:  # how far the camera was (added later, so only when given)
        parts.append("z" + str(zoom))
    raw = "|".join(parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:24], prompt.strip()


def image_from_body(body):
    url = body.get("image", "")
    if not isinstance(url, str) or "," not in url:
        raise ApiError(400, "bad_image", "No picture was attached.")
    data = base64.b64decode(url.split(",", 1)[1], validate=False)
    if len(data) > MAX_UPLOAD_BYTES:
        raise ApiError(413, "too_big", "That picture is too large (max 15 MB).")
    return data


def validate(body):
    car, angle, env, mods, prompt = (body.get(k) for k in ("car", "angle", "env", "mods", "prompt"))
    if car not in CAR_IDS or angle not in ANGLES or env not in ENV_IDS:
        raise ApiError(400, "bad_request", "Unknown car, angle or setting. (A new setting must be added to ENV_IDS in server/app.py too.)")
    if not isinstance(mods, dict) or len(json.dumps(mods)) > MAX_MODS_JSON:
        raise ApiError(400, "bad_request", "The build is missing or too large.")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > MAX_PROMPT:
        raise ApiError(400, "bad_request", "The AI instruction is missing or too long.")
    photo = stock_photo(car, angle)
    if not photo:
        raise ApiError(404, "no_photo", f"There's no stock picture yet. Add photos/{car}-{angle}.jpg (see photos/README.md).")
    return car, angle, env, mods, prompt.strip(), photo


def find_image(node):
    """Find the last base64 image in a Gemini response, whatever its exact nesting.
    Output-like branches are searched first."""
    found = None
    if isinstance(node, dict):
        if node.get("type") == "image" and isinstance(node.get("data"), str):
            found = node["data"]
        inline = node.get("inline_data") or node.get("inlineData")
        if isinstance(inline, dict) and isinstance(inline.get("data"), str):
            found = inline["data"]
        preferred = [k for k in ("output", "outputs", "output_image", "steps", "candidates") if k in node]
        for k in preferred:
            found = find_image(node[k]) or found
        if found:
            return found
        for k, v in node.items():
            if k not in preferred and k != "input":
                found = find_image(v) or found
    elif isinstance(node, list):
        for v in node:
            found = find_image(v) or found
    return found


def google_request(url, body=None, timeout=120):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method="POST" if body is not None else "GET",
                                 headers={"Content-Type": "application/json", "x-goog-api-key": API_KEY})
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def gemini_render(prompt, photo, photo_bytes=None):
    if not API_KEY:
        raise ApiError(503, "no_key", "No Gemini API key yet. Add GEMINI_API_KEY to the .env file, then restart start.bat.")
    mime = IMAGE_TYPES.get(image_ext(photo_bytes) or "", "image/jpeg") if photo_bytes else IMAGE_TYPES[photo.suffix.lower()]
    photo_bytes = photo_bytes or photo.read_bytes()
    body = {
        "model": MODEL,
        "input": [
            {"type": "text", "text": prompt},
            {"type": "image", "mime_type": mime, "data": base64.b64encode(photo_bytes).decode("ascii")},
        ],
        "response_format": {"type": "image", "mime_type": "image/jpeg", "aspect_ratio": "16:9", "image_size": "1K"},
    }
    try:
        result = google_request(f"{API_BASE}/interactions", body)
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")[:500]
        print(f"[gemini] HTTP {e.code}: {detail}", file=sys.stderr)
        if e.code in (401, 403) and "billing" in detail.lower():
            raise ApiError(402, "needs_billing", "This image model needs billing turned on in Google AI Studio. Switch RENDER_MODE back to manual to keep it free.")
        if e.code in (400, 401, 403, 404):
            raise ApiError(502, "provider_rejected", "Google rejected the request. Check the API key and model name in .env (details in the server window).")
        if e.code == 429 and ("free tier" in detail.lower() or "limit: 0" in detail.lower()):
            raise ApiError(402, "needs_billing", "Your Google key is on the free tier, which can't make images. Turn on billing in Google AI Studio (aistudio.google.com), then try again. Nothing was charged.")
        if e.code == 429:
            raise ApiError(429, "provider_limit", "Google's usage limit was reached. Try again later.")
        raise ApiError(502, "provider_error", "The AI service had a problem. Please try again.")
    except (urllib.error.URLError, TimeoutError):
        raise ApiError(504, "provider_timeout", "The AI service didn't respond. Check your internet and try again.")
    data = find_image(result)
    try:
        image = base64.b64decode(data) if data else b""
    except ValueError:
        image = b""  # a garbled picture is treated like no picture
    if not image or image == photo_bytes:
        print(f"[gemini] no new image in response: {json.dumps(result)[:500]}", file=sys.stderr)
        raise ApiError(502, "no_image", "The AI didn't return a new picture (it may have declined). Try a different build or try again.")
    return image


# ---------- HTTP ----------

class Handler(http.server.SimpleHTTPRequestHandler):
    # Set file types explicitly: Windows settings can make Python label .js as plain text,
    # and browsers refuse to run 3D module code that isn't labelled as JavaScript.
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
                      ".json": "application/json", ".glb": "model/gltf-binary",
                      ".hdr": "application/octet-stream", ".wasm": "application/wasm"}

    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(ROOT), **kw)

    def log_message(self, fmt, *args):
        if "/api/" in self.path:
            super().log_message(fmt, *args)

    def end_headers(self):
        # Renders have a version in their link, so keep them for a year. API replies change
        # every time, so never keep them. Everything else (3D cars, skies, code) may be kept
        # but must be checked first: an unchanged file comes back as a quick "304 not modified"
        # instead of 5-20 MB again, and edits still show at once.
        if self.path.startswith("/renders/"):
            rule = "max-age=31536000"
        elif self.path.startswith("/api/"):
            rule = "no-store"
        else:
            rule = "no-cache"
        self.send_header("Cache-Control", rule)
        super().end_headers()

    def list_directory(self, path):
        self.send_error(404)  # never show folder contents
        return None

    def send_json(self, status, obj):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def bad_host(self):
        # Blocks "DNS rebinding", where another website pretends to be this computer.
        if (self.headers.get("Host") or "").lower() not in ALLOWED_HOSTS:
            self.send_error(400, "Unknown host")
            return True
        return False

    def blocked(self):
        """True for anything outside the allowed files, checked on the fully decoded path."""
        full = pathlib.Path(self.translate_path(self.path)).resolve()
        try:
            parts = [p.lower() for p in full.relative_to(ROOT).parts]
        except ValueError:
            return True  # outside the project folder
        if not parts:
            return False  # "/" -> index.html
        if parts[0] not in ALLOWED_TOP or any(p.startswith(".") for p in parts):
            return True
        return parts[0] == "renders" and parts[-1] == "usage.json"

    def do_GET(self):
        if self.bad_host():
            return
        route = self.path.split("?", 1)[0]
        if route == "/api/photos":
            # Which stock pictures exist, so the site doesn't have to guess file types.
            found = {}
            for car in CAR_IDS:
                for angle in ANGLES:
                    p = stock_photo(car, angle)
                    if p:
                        found[f"{car}-{angle}"] = f"photos/{p.name}"
            return self.send_json(200, found)
        if route == "/api/status":
            _, used = read_usage()
            return self.send_json(200, {"mode": MODE, "model": MODEL if MODE == "gemini" else None,
                                        "hasKey": bool(API_KEY), "dailyLimit": DAILY_LIMIT, "usedToday": used,
                                        "ebay": bool(EBAY_ID and EBAY_SECRET)})
        if route == "/api/parts":
            # Real listings for a part: /api/parts?q=Volkswagen+Golf+Mk8.5+coilovers
            query = urllib.parse.parse_qs(self.path.split("?", 1)[1] if "?" in self.path else "")
            words = (query.get("q") or [""])[0].strip()[:120]
            if not words:
                return self.send_json(400, {"error": "bad_request", "message": "Say what to search for."})
            try:
                return self.send_json(200, {"items": ebay_search(words)})
            except ApiError as e:
                return self.send_json(e.status, {"error": e.code, "message": e.message})
        if self.blocked():
            return self.send_error(404)
        return super().do_GET()

    def do_HEAD(self):
        if self.bad_host():
            return
        if self.blocked():
            return self.send_error(404)
        return super().do_HEAD()

    def do_POST(self):
        if self.bad_host():
            return
        # Only accept requests made by this site's own pages.
        origin = self.headers.get("Origin")
        if origin and origin not in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"):
            return self.send_json(403, {"error": "forbidden", "message": "Requests from other websites are not allowed."})
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 0:
                raise ApiError(400, "bad_request", "The request wasn't valid.")
            if length > MAX_UPLOAD_BYTES * 2:
                raise ApiError(413, "too_big", "That picture is too large (max 15 MB).")
            body = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(body, dict):
                raise ApiError(400, "bad_request", "The request wasn't valid.")
            route = self.path.split("?", 1)[0]
            if body.get("source") == "3d" and route in ("/api/lookup", "/api/render", "/api/upload"):
                return self.send_json(200, self.handle_3d(route, body))
            if route == "/api/lookup":
                car, angle, env, mods, prompt, photo = validate(body)
                hit = cached_render(cache_key(car, angle, env, mods, photo))
                return self.send_json(200, {"url": render_url(hit) if hit else None})
            if route == "/api/render":
                return self.send_json(200, self.render(body))
            if route == "/api/upload":
                return self.send_json(200, self.upload(body))
            raise ApiError(404, "not_found", "Unknown API address.")
        except ApiError as e:
            return self.send_json(e.status, {"error": e.code, "message": e.message})
        except (ValueError, json.JSONDecodeError):
            return self.send_json(400, {"error": "bad_request", "message": "The request wasn't valid."})
        except Exception:
            traceback.print_exc()
            return self.send_json(500, {"error": "server_error", "message": "Something went wrong on this computer's server. Details are in the black window."})

    def render(self, body):
        car, angle, env, mods, prompt, photo = validate(body)
        key = cache_key(car, angle, env, mods, photo)
        hit = cached_render(key)
        if hit:
            return {"url": render_url(hit), "cached": True}
        if MODE == "manual":
            raise ApiError(409, "manual_mode", "Automatic renders are off (free manual mode).")
        change_usage(+1)
        try:
            if MODE == "mock":
                time.sleep(1.5)
                data = photo.read_bytes()
            else:
                data = gemini_render(prompt, photo)
            path = save_render(key, data)
        except Exception:
            change_usage(-1)  # failed attempts (of any kind) don't use up the daily limit
            raise
        return {"url": render_url(path), "cached": False}

    def handle_3d(self, route, body):
        key, prompt = validate_3d(body)
        hit = cached_render(key)
        if route == "/api/lookup":
            return {"url": render_url(hit) if hit else None}
        if route == "/api/upload":
            return {"url": render_url(save_render(key, image_from_body(body)))}
        if hit:
            return {"url": render_url(hit), "cached": True}
        if MODE == "manual":
            raise ApiError(409, "manual_mode", "Automatic renders are off (free manual mode).")
        shot = image_from_body(body)
        change_usage(+1)
        try:
            data = shot if MODE == "mock" else gemini_render(prompt, None, shot)
            path = save_render(key, data)
        except Exception:
            change_usage(-1)
            raise
        return {"url": render_url(path), "cached": False}

    def upload(self, body):
        car, angle, env, mods, prompt, photo = validate(body)
        url = body.get("image", "")
        if not isinstance(url, str) or "," not in url:
            raise ApiError(400, "bad_image", "No picture was attached.")
        data = base64.b64decode(url.split(",", 1)[1], validate=False)
        if len(data) > MAX_UPLOAD_BYTES:
            raise ApiError(413, "too_big", "That picture is too large (max 15 MB).")
        return {"url": render_url(save_render(cache_key(car, angle, env, mods, photo), data))}


def check_key():
    """Free check: lists the models this key can use (costs nothing) and confirms the image model is one of them."""
    if not API_KEY:
        print("No GEMINI_API_KEY in .env yet.")
        return 1
    try:
        names, url = [], f"{API_BASE}/models?pageSize=200"
        while url:
            page = google_request(url, timeout=30)
            names += [m.get("name", "").removeprefix("models/") for m in page.get("models", [])]
            token = page.get("nextPageToken")
            url = f"{API_BASE}/models?pageSize=200&pageToken={token}" if token else None
    except urllib.error.HTTPError as e:
        print(f"Google said no (HTTP {e.code}). The key may be wrong: {e.read().decode('utf-8', 'replace')[:300]}")
        return 1
    except urllib.error.URLError as e:
        print(f"Couldn't reach Google: {e.reason}")
        return 1
    image_models = sorted(n for n in names if "image" in n or "banana" in n)
    print("Your key works. Image models it can see:")
    for n in image_models:
        print("  -", n, "<- in use" if n == MODEL else "")
    if MODEL not in names:
        print(f"\nGEMINI_IMAGE_MODEL '{MODEL}' isn't in that list. Pick one of the names above.")
        return 1
    print(f"\n'{MODEL}' is available. Remember: Google charges for each automatic render.")
    return 0


def main():
    if "--check-ebay" in sys.argv:
        # Free test of the eBay keys: py server\app.py --check-ebay
        try:
            found = ebay_search("Volkswagen Golf coilovers")
        except ApiError as e:
            print(e.message)
            sys.exit(1)
        print(f"Your eBay keys work. Found {len(found)} listings, for example:")
        for it in found:
            print(f"  £{it['price']:.2f}  {it['title'][:70]}")
        sys.exit(0)
    if "--check" in sys.argv:
        sys.exit(check_key())
    open_browser = "--no-browser" not in sys.argv
    server = http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print(f"Custom Cars is running at {url}  (render mode: {MODE})")
    print("Keep this window open while you use the site. Close it to stop.")
    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
