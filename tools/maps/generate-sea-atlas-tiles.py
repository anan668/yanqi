#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
import json
import math
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path

try:
    import requests
except ImportError:  # pragma: no cover - optional when local geojson is already present
    requests = None
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SITE_ROOT = ROOT / "site"
CATALOG_PATH = SITE_ROOT / "js" / "yanqi-spot-map-catalog.js"
SOURCE_DIR = ROOT / "tools" / "maps" / "source" / "natural-earth"
LAND_GEOJSON_PATH = SOURCE_DIR / "ne_10m_land.geojson"
PACKS_ROOT = SITE_ROOT / "assets" / "maps" / "packs"
INDEX_PATH = PACKS_ROOT / "index.json"
LAND_GEOJSON_URL = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson"
TILE_SIZE = 1024
MAX_LAT = 85.05112878
SEA_ATLAS_LEAFLET_ZOOM_OFFSET = -2
SEA_ATLAS_TILE_BOUNDS_LAT_EXPANSION = 1.8
SEA_ATLAS_TILE_BOUNDS_LON_EXPANSION = 4.0
SEA_ATLAS_TILE_BUFFER_COLUMNS = 2
SEA_ATLAS_TILE_BUFFER_ROWS = 2
SEA_ATLAS_PACK_FORMAT = "script"
SEA_ATLAS_LABEL_TILE_MARGIN = 240
SEA_ATLAS_LABEL_COLLISION_PADDING = 18
SEA_ATLAS_LABEL_KIND_ORDER = {
    "country": 0,
    "region": 1,
    "sea": 2,
}
SEA_ATLAS_FONT_PATHS = {
    "serif": [
        Path("C:/Windows/Fonts/georgia.ttf"),
        Path("C:/Windows/Fonts/times.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf"),
    ],
    "serif_bold": [
        Path("C:/Windows/Fonts/georgiab.ttf"),
        Path("C:/Windows/Fonts/timesbd.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSerif-Bold.ttf"),
    ],
    "serif_italic": [
        Path("C:/Windows/Fonts/georgiai.ttf"),
        Path("C:/Windows/Fonts/timesi.ttf"),
        Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf"),
        Path("/usr/share/fonts/truetype/liberation2/LiberationSerif-Italic.ttf"),
    ],
}


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def tile_x_to_lon(x: float, z: int) -> float:
    return (x / (2**z)) * 360.0 - 180.0


def tile_y_to_lat(y: float, z: int) -> float:
    n = math.pi - (2.0 * math.pi * y / (2**z))
    return math.degrees(math.atan(math.sinh(n)))


def lon_to_tile_x(lon: float, z: int) -> int:
    n = 2**z
    return int(clamp(math.floor(((lon + 180.0) / 360.0) * n), 0, n - 1))


def lat_to_tile_y(lat: float, z: int) -> int:
    n = 2**z
    lat = clamp(lat, -MAX_LAT, MAX_LAT)
    lat_rad = math.radians(lat)
    y = (1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi) / 2.0 * n
    return int(clamp(math.floor(y), 0, n - 1))


def project_lon_lat(lon: float, lat: float, z: int, x: int, y: int) -> tuple[float, float]:
    lat = clamp(lat, -MAX_LAT, MAX_LAT)
    n = 2**z
    world_x = ((lon + 180.0) / 360.0) * n * TILE_SIZE
    lat_rad = math.radians(lat)
    world_y = (
        (1.0 - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi)
        / 2.0
        * n
        * TILE_SIZE
    )
    return world_x - (x * TILE_SIZE), world_y - (y * TILE_SIZE)


def mercator_ratio_for_lat(lat: float) -> float:
    lat = clamp(lat, -MAX_LAT, MAX_LAT)
    lat_rad = math.radians(lat)
    ratio = (
        1.0
        - math.log(math.tan(lat_rad) + (1 / math.cos(lat_rad))) / math.pi
    ) / 2.0
    return clamp(ratio, 0.0, 1.0)


def mix_rgb(base: tuple[int, int, int], tint: tuple[int, int, int], amount: float) -> tuple[int, int, int]:
    clamped_amount = clamp(amount, 0.0, 1.0)
    inverse = 1.0 - clamped_amount
    return (
        round(base[0] * inverse + tint[0] * clamped_amount),
        round(base[1] * inverse + tint[1] * clamped_amount),
        round(base[2] * inverse + tint[2] * clamped_amount),
    )


def ocean_color_for_lat(lat: float) -> tuple[int, int, int]:
    top = (24, 81, 107)
    bottom = (6, 31, 48)
    ratio = mercator_ratio_for_lat(lat)
    return (
        round(top[0] + (bottom[0] - top[0]) * ratio),
        round(top[1] + (bottom[1] - top[1]) * ratio),
        round(top[2] + (bottom[2] - top[2]) * ratio),
    )


def lagoon_fill_for_ring(ring: list[tuple[float, float]]) -> tuple[int, int, int, int]:
    _, south, _, north = (
        min(pt[0] for pt in ring),
        min(pt[1] for pt in ring),
        max(pt[0] for pt in ring),
        max(pt[1] for pt in ring),
    )
    ocean_rgb = ocean_color_for_lat((south + north) / 2.0)
    softened = mix_rgb(ocean_rgb, (78, 132, 154), 0.18)
    return (*softened, 228)


@lru_cache(maxsize=None)
def load_label_font(size: int, variant: str = "serif"):
    candidates = SEA_ATLAS_FONT_PATHS.get(variant, []) + SEA_ATLAS_FONT_PATHS["serif"]
    for font_path in candidates:
        if font_path.exists():
            return ImageFont.truetype(str(font_path), size=max(12, int(size)))
    return ImageFont.load_default()


def get_label_visibility_limit(z: int) -> int:
    if z <= 4:
        return 2
    if z <= 5:
        return 3
    if z <= 6:
        return 4
    return 99


def get_context_label_style(kind: str, z: int) -> dict:
    safe_kind = str(kind or "region").strip().lower()

    if safe_kind == "country":
        size = 38 if z >= 8 else 34 if z >= 6 else 28 if z >= 5 else 24
        return {
            "font": load_label_font(size, "serif_bold"),
            "fill": (240, 248, 252, 214),
            "stroke": (6, 24, 37, 140),
            "stroke_width": 2,
            "shadow": (2, 14, 24, 108),
            "shadow_offset": (0, 2),
        }

    if safe_kind == "sea":
        size = 28 if z >= 8 else 26 if z >= 6 else 24 if z >= 5 else 20
        return {
            "font": load_label_font(size, "serif_italic"),
            "fill": (202, 231, 240, 168),
            "stroke": (5, 20, 31, 110),
            "stroke_width": 1,
            "shadow": (2, 14, 24, 82),
            "shadow_offset": (0, 2),
        }

    size = 30 if z >= 8 else 28 if z >= 6 else 24 if z >= 5 else 20
    return {
        "font": load_label_font(size, "serif"),
        "fill": (222, 241, 248, 188),
        "stroke": (5, 22, 34, 118),
        "stroke_width": 1,
        "shadow": (2, 14, 24, 90),
        "shadow_offset": (0, 2),
    }


def boxes_intersect(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return not (a[2] <= b[0] or a[0] >= b[2] or a[3] <= b[1] or a[1] >= b[3])


def measure_centered_text_bbox(
    draw: ImageDraw.ImageDraw,
    text: str,
    font,
    center: tuple[float, float],
    stroke_width: int = 0,
) -> tuple[float, float, float, float]:
    if hasattr(draw, "textbbox"):
        return draw.textbbox(
            center,
            text,
            font=font,
            anchor="mm",
            stroke_width=stroke_width,
        )

    width, height = draw.textsize(text, font=font)
    padded_width = width + (stroke_width * 2)
    padded_height = height + (stroke_width * 2)
    px, py = center
    half_width = padded_width / 2
    half_height = padded_height / 2
    return (
        px - half_width,
        py - half_height,
        px + half_width,
        py + half_height,
    )


def build_context_label_layout(draw: ImageDraw.ImageDraw, labels: list[dict], z: int, x: int, y: int) -> list[dict]:
    if not labels:
        return []

    west = tile_x_to_lon(x, z)
    east = tile_x_to_lon(x + 1, z)
    north = tile_y_to_lat(y, z)
    south = tile_y_to_lat(y + 1, z)
    # Allow chart labels to spill across neighboring tiles so country names do
    # not get cut off at pack seams in the default viewport mosaic.
    pad_ratio = max(0.14, (SEA_ATLAS_LABEL_TILE_MARGIN / TILE_SIZE) + 0.04)
    lon_pad = (east - west) * pad_ratio
    lat_pad = (north - south) * pad_ratio
    visibility_limit = get_label_visibility_limit(z)
    candidates = []

    for label in labels:
        coords = label.get("coords") or []
        if len(coords) != 2:
            continue

        lat = float(coords[0])
        lon = float(coords[1])
        if lon < west - lon_pad or lon > east + lon_pad or lat < south - lat_pad or lat > north + lat_pad:
            continue

        priority = int(label.get("priority") or 99)
        if priority > visibility_limit:
            continue

        kind = str(label.get("kind") or "region").strip().lower()
        style = get_context_label_style(kind, z)
        px, py = project_lon_lat(lon, lat, z, x, y)
        text = str(label.get("name") or "").strip()
        if not text:
            continue

        bbox = measure_centered_text_bbox(
            draw,
            text,
            style["font"],
            (px, py),
            style["stroke_width"],
        )
        if (
            bbox[0] < -SEA_ATLAS_LABEL_TILE_MARGIN
            or bbox[1] < -SEA_ATLAS_LABEL_TILE_MARGIN
            or bbox[2] > TILE_SIZE + SEA_ATLAS_LABEL_TILE_MARGIN
            or bbox[3] > TILE_SIZE + SEA_ATLAS_LABEL_TILE_MARGIN
        ):
            continue

        candidates.append({
            "priority": priority,
            "kind_order": SEA_ATLAS_LABEL_KIND_ORDER.get(kind, 9),
            "text": text,
            "point": (px, py),
            "bbox": bbox,
            "style": style,
        })

    accepted = []
    collision_boxes: list[tuple[float, float, float, float]] = []
    for candidate in sorted(candidates, key=lambda item: (item["priority"], item["kind_order"], item["text"])):
        bbox = candidate["bbox"]
        expanded_box = (
            bbox[0] - SEA_ATLAS_LABEL_COLLISION_PADDING,
            bbox[1] - SEA_ATLAS_LABEL_COLLISION_PADDING,
            bbox[2] + SEA_ATLAS_LABEL_COLLISION_PADDING,
            bbox[3] + SEA_ATLAS_LABEL_COLLISION_PADDING,
        )
        if any(boxes_intersect(expanded_box, existing) for existing in collision_boxes):
            continue
        collision_boxes.append(expanded_box)
        accepted.append(candidate)

    return accepted


def draw_context_labels(draw: ImageDraw.ImageDraw, labels: list[dict], z: int, x: int, y: int) -> None:
    for label in build_context_label_layout(draw, labels, z, x, y):
        px, py = label["point"]
        style = label["style"]
        shadow_offset_x, shadow_offset_y = style["shadow_offset"]
        draw.text(
            (px + shadow_offset_x, py + shadow_offset_y),
            label["text"],
            font=style["font"],
            fill=style["shadow"],
            anchor="mm",
        )
        draw.text(
            (px, py),
            label["text"],
            font=style["font"],
            fill=style["fill"],
            anchor="mm",
            stroke_width=style["stroke_width"],
            stroke_fill=style["stroke"],
        )


def expand_bounds(
    bounds: list[list[float]],
    lat_factor: float = SEA_ATLAS_TILE_BOUNDS_LAT_EXPANSION,
    lon_factor: float = SEA_ATLAS_TILE_BOUNDS_LON_EXPANSION,
) -> list[list[float]]:
    (south, west), (north, east) = bounds
    lat_pad = (north - south) * lat_factor
    lon_pad = (east - west) * lon_factor
    return [
        [south - lat_pad, west - lon_pad],
        [north + lat_pad, east + lon_pad],
    ]


def pad_bounds_by_tiles(
    bounds: list[list[float]],
    zoom: int,
    lat_tiles: float = SEA_ATLAS_TILE_BUFFER_ROWS,
    lon_tiles: float = SEA_ATLAS_TILE_BUFFER_COLUMNS,
) -> list[list[float]]:
    (south, west), (north, east) = bounds
    normalized_zoom = max(0, int(zoom))
    lat_center = (south + north) / 2
    tile_lon_span = 360.0 / (2**normalized_zoom)
    tile_y = lat_to_tile_y(lat_center, normalized_zoom)
    tile_lat_span = abs(tile_y_to_lat(tile_y, normalized_zoom) - tile_y_to_lat(tile_y + 1, normalized_zoom))
    lat_pad = tile_lat_span * max(0.0, float(lat_tiles))
    lon_pad = tile_lon_span * max(0.0, float(lon_tiles))
    return [
        [south - lat_pad, west - lon_pad],
        [north + lat_pad, east + lon_pad],
    ]


def get_catalog_spots() -> list[dict]:
    node_script = f"""
const fs = require('fs');
const vm = require('vm');
const src = fs.readFileSync({json.dumps(str(CATALOG_PATH))}, 'utf8');
const sandbox = {{ window: {{}} }};
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
process.stdout.write(JSON.stringify(sandbox.window.YanqiSpotMapCatalog.list));
"""
    result = subprocess.run(
        ["node", "-e", node_script],
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="strict",
        cwd=ROOT,
    )
    return json.loads(result.stdout)


def ensure_land_geojson() -> None:
    if LAND_GEOJSON_PATH.exists():
        return

    if requests is None:
        raise RuntimeError(
            "requests is required to download ne_10m_land.geojson when the local source file is missing"
        )

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    response = requests.get(LAND_GEOJSON_URL, timeout=60)
    response.raise_for_status()
    LAND_GEOJSON_PATH.write_bytes(response.content)


def load_polygons() -> list[dict]:
    ensure_land_geojson()
    data = json.loads(LAND_GEOJSON_PATH.read_text(encoding="utf-8"))
    polygons: list[dict] = []

    def normalize_ring(raw_ring: list[list[float]]) -> list[tuple[float, float]]:
        ring = []
        for lon, lat, *_ in raw_ring:
            ring.append((float(lon), clamp(float(lat), -MAX_LAT, MAX_LAT)))
        return ring

    def ring_bbox(ring: list[tuple[float, float]]) -> tuple[float, float, float, float]:
        lons = [pt[0] for pt in ring]
        lats = [pt[1] for pt in ring]
        return min(lons), min(lats), max(lons), max(lats)

    for feature in data.get("features", []):
        geometry = feature.get("geometry") or {}
        geom_type = geometry.get("type")
        coordinates = geometry.get("coordinates") or []

        if geom_type == "Polygon":
            polygon_sets = [coordinates]
        elif geom_type == "MultiPolygon":
            polygon_sets = coordinates
        else:
            continue

        for polygon in polygon_sets:
            if not polygon:
                continue
            outer = normalize_ring(polygon[0])
            if len(outer) < 3:
                continue
            holes = [normalize_ring(ring) for ring in polygon[1:] if len(ring) >= 3]
            polygons.append(
                {
                    "outer": outer,
                    "holes": holes,
                    "bbox": ring_bbox(outer),
                }
            )

    return polygons


def bbox_intersects(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def draw_ocean(draw: ImageDraw.ImageDraw, z: int, x: int, y: int) -> None:
    world_height = (2**z) * TILE_SIZE
    top = (24, 81, 107, 255)
    bottom = (6, 31, 48, 255)
    for py in range(TILE_SIZE):
        global_y = y * TILE_SIZE + py
        ratio = global_y / max(world_height - 1, 1)
        r = round(top[0] + (bottom[0] - top[0]) * ratio)
        g = round(top[1] + (bottom[1] - top[1]) * ratio)
        b = round(top[2] + (bottom[2] - top[2]) * ratio)
        draw.line([(0, py), (TILE_SIZE, py)], fill=(r, g, b, 255))


def draw_graticule(draw: ImageDraw.ImageDraw, z: int, x: int, y: int) -> None:
    west = tile_x_to_lon(x, z)
    east = tile_x_to_lon(x + 1, z)
    north = tile_y_to_lat(y, z)
    south = tile_y_to_lat(y + 1, z)

    if z <= 5:
        step = 10.0
    elif z <= 7:
        step = 5.0
    elif z <= 9:
        step = 2.0
    elif z <= 11:
        step = 1.0
    else:
        step = 0.5

    lon_start = math.floor(west / step) * step
    lat_start = math.floor(south / step) * step

    lon = lon_start
    while lon <= east:
        px, _ = project_lon_lat(lon, north, z, x, y)
        if -2 <= px <= TILE_SIZE + 2:
            draw.line([(px, 0), (px, TILE_SIZE)], fill=(194, 229, 238, 18), width=1)
        lon += step

    lat = lat_start
    while lat <= north:
        _, py = project_lon_lat(west, lat, z, x, y)
        if -2 <= py <= TILE_SIZE + 2:
            draw.line([(0, py), (TILE_SIZE, py)], fill=(194, 229, 238, 16), width=1)
        lat += step


def render_tile_bytes(polygons: list[dict], context_labels: list[dict], z: int, x: int, y: int) -> bytes:
    image = Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
    draw = ImageDraw.Draw(image, "RGBA")
    draw_ocean(draw, z, x, y)
    draw_graticule(draw, z, x, y)

    west = tile_x_to_lon(x, z)
    east = tile_x_to_lon(x + 1, z)
    north = tile_y_to_lat(y, z)
    south = tile_y_to_lat(y + 1, z)
    tile_bbox = (west, south, east, north)

    land_fill = (108, 136, 128, 255)
    land_shadow = (214, 242, 247, 36)
    coast_line = (222, 243, 248, 120)

    for polygon in polygons:
        if not bbox_intersects(polygon["bbox"], tile_bbox):
            continue

        outer = [project_lon_lat(lon, lat, z, x, y) for lon, lat in polygon["outer"]]
        if len(outer) < 3:
            continue

        draw.polygon(outer, fill=land_fill)
        draw.line(outer, fill=land_shadow, width=5)
        draw.line(outer, fill=coast_line, width=2)

        for hole in polygon["holes"]:
            if z <= 6:
                continue
            hole_points = [project_lon_lat(lon, lat, z, x, y) for lon, lat in hole]
            if len(hole_points) < 3:
                continue
            draw.polygon(hole_points, fill=lagoon_fill_for_ring(hole))
            draw.line(hole_points, fill=(194, 229, 238, 28), width=1)

    draw_context_labels(draw, context_labels, z, x, y)

    output = io.BytesIO()
    image.save(output, format="WEBP", quality=86, method=6)
    return output.getvalue()


def tile_range_for_bounds(bounds: list[list[float]], z: int) -> tuple[int, int, int, int]:
    (south, west), (north, east) = bounds
    epsilon = 1e-9
    x_start = lon_to_tile_x(west, z)
    x_end = lon_to_tile_x(east - epsilon, z)
    y_start = lat_to_tile_y(north, z)
    y_end = lat_to_tile_y(south + epsilon, z)
    return x_start, x_end, y_start, y_end


def reset_packs_root() -> None:
    if PACKS_ROOT.exists():
        shutil.rmtree(PACKS_ROOT)
    PACKS_ROOT.mkdir(parents=True, exist_ok=True)


def build_spot_manifest(spot: dict, bounds: list[list[float]], tile_count: int) -> dict:
    zoom = int(spot["zoom"])
    return {
        "key": spot["key"],
        "name": spot["name"],
        "offlineTilePack": f"assets/maps/packs/{spot['key']}.pack.js",
        "offlineTilePackFormat": SEA_ATLAS_PACK_FORMAT,
        "offlineMinZoom": max(4, zoom - 4),
        "offlineMaxZoom": min(13, zoom + 2),
        "offlineTileSize": TILE_SIZE,
        "offlineZoomOffset": SEA_ATLAS_LEAFLET_ZOOM_OFFSET,
        "initialViewMode": "bounds" if spot.get("mapBounds") else "center",
        "bounds": bounds,
        "tileCount": tile_count,
    }


def generate_packs() -> None:
    polygons = load_polygons()
    spots = get_catalog_spots()
    reset_packs_root()

    index_manifest = {
        "version": "2026-04-12",
        "generator": "tools/maps/generate-sea-atlas-tiles.py",
        "packFormat": SEA_ATLAS_PACK_FORMAT,
        "tileSize": TILE_SIZE,
        "zoomOffset": SEA_ATLAS_LEAFLET_ZOOM_OFFSET,
        "spots": [],
    }

    for spot in spots:
        key = spot["key"]
        zoom = int(spot["zoom"])
        context_labels = spot.get("contextLabels") or []
        bounds = expand_bounds(
            spot["mapBounds"],
            SEA_ATLAS_TILE_BOUNDS_LAT_EXPANSION,
            SEA_ATLAS_TILE_BOUNDS_LON_EXPANSION,
        )
        bounds = pad_bounds_by_tiles(
            bounds,
            zoom,
            SEA_ATLAS_TILE_BUFFER_ROWS,
            SEA_ATLAS_TILE_BUFFER_COLUMNS,
        )
        logical_min_zoom = max(4, zoom - 4)
        logical_max_zoom = min(13, zoom + 2)
        storage_min_zoom = max(0, logical_min_zoom + SEA_ATLAS_LEAFLET_ZOOM_OFFSET)
        storage_max_zoom = max(storage_min_zoom, logical_max_zoom + SEA_ATLAS_LEAFLET_ZOOM_OFFSET)

        pack_path = PACKS_ROOT / f"{key}.pack.js"
        tile_count = 0
        tile_payload: dict[str, str] = {}

        for z in range(storage_min_zoom, storage_max_zoom + 1):
            x_start, x_end, y_start, y_end = tile_range_for_bounds(bounds, z)
            for x in range(x_start, x_end + 1):
                for y in range(y_start, y_end + 1):
                    tile_bytes = render_tile_bytes(polygons, context_labels, z, x, y)
                    tile_payload[f"{z}/{x}/{y}.webp"] = base64.b64encode(tile_bytes).decode("ascii")
                    tile_count += 1

        manifest = build_spot_manifest(spot, bounds, tile_count)
        pack_record = {
            "manifest": manifest,
            "tiles": tile_payload,
        }
        pack_script = (
            "(function registerSeaAtlasPack(global) {\n"
            "    const registry = global.__YANQI_SEA_ATLAS_PACKS__ = global.__YANQI_SEA_ATLAS_PACKS__ || Object.create(null);\n"
            f"    registry[{json.dumps(key)}] = {json.dumps(pack_record, ensure_ascii=False, separators=(',', ':'))};\n"
            "})(window);\n"
        )
        pack_path.write_text(pack_script, encoding="utf-8")

        manifest["packSizeBytes"] = pack_path.stat().st_size
        index_manifest["spots"].append(manifest)
        print(f"generated {key}: {tile_count} packed tiles")

    INDEX_PATH.write_text(json.dumps(index_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {INDEX_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    generate_packs()
