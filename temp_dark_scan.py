import json, base64, io
from pathlib import Path
from PIL import Image

PACKS_DIR = Path('site/assets/maps/packs')
KEYS = ['redang','komodo','maldives-liveaboard']
results = []
for key in KEYS:
    data = (PACKS_DIR / f"{key}.pack.js").read_text(encoding='utf-8')
    prefix = f'registry["{key}"] = '
    start = data.index(prefix) + len(prefix)
    end = data.rindex('};\n})(window);')
    pack = json.loads(data[start:end+1])
    target = None
    tiles = list(pack['tiles'].items())
    for tile_key, tile_b64 in tiles[:200]:
        img = Image.open(io.BytesIO(base64.b64decode(tile_b64))).convert('RGBA')
        pix = img.load()
        width, height = img.size
        dark = []
        for px in range(width):
            for py in range(height):
                r,g,b,a = pix[px,py]
                if a == 255 and (r+g+b) < 60:
                    dark.append((px,py))
        if len(dark) > 300:
            xs = [p[0] for p in dark]
            ys = [p[1] for p in dark]
            target = {
                'tile': tile_key,
                'count': len(dark),
                'bbox': (min(xs), min(ys), max(xs), max(ys))
            }
            break
    results.append({'key':key, 'dark_tile':target})
print(json.dumps(results, indent=2))
