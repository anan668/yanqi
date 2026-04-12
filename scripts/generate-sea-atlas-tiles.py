#!/usr/bin/env python3
from __future__ import annotations

import base64
import io
import json
import math
import shutil
import subprocess
from pathlib import Path

import requests
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
CATALOG_PATH = ROOT / "js" / "yanqi-spot-map-catalog.js"
SOURCE_DIR = ROOT / "assets" / "maps" / "source" / "natural-earth"
LAND_GEOJSON_PATH = SOURCE_DIR / "ne_10m_land.geojson"
PACKS_ROOT = ROOT / "assets" / "maps" / "packs"
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


def render_tile_bytes(polygons: list[dict], z: int, x: int, y: int) -> bytes:
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
            hole_points = [project_lon_lat(lon, lat, z, x, y) for lon, lat in hole]
            if len(hole_points) < 3:
                continue
            draw.polygon(hole_points, fill=(10, 48, 69, 255))
            draw.line(hole_points, fill=(194, 229, 238, 42), width=1)

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
        "generator": "scripts/generate-sea-atlas-tiles.py",
        "packFormat": SEA_ATLAS_PACK_FORMAT,
        "tileSize": TILE_SIZE,
        "zoomOffset": SEA_ATLAS_LEAFLET_ZOOM_OFFSET,
        "spots": [],
    }

    for spot in spots:
        key = spot["key"]
        zoom = int(spot["zoom"])
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
                    tile_bytes = render_tile_bytes(polygons, z, x, y)
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
