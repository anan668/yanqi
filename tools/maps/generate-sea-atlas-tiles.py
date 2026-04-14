#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import io
import json
import math
import os
import shutil
import subprocess
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:
    import requests
except ImportError:  # pragma: no cover - optional when local geojson is already present
    requests = None
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
SITE_ROOT = ROOT / "site"
CATALOG_PATH = SITE_ROOT / "js" / "yanqi-spot-map-catalog.js"
SOURCE_DIR = ROOT / "tools" / "maps" / "source" / "natural-earth"
PACKS_ROOT = SITE_ROOT / "assets" / "maps" / "packs"
INDEX_PATH = PACKS_ROOT / "index.json"

SEA_ATLAS_PACK_FORMAT = "script"
SEA_ATLAS_INDEX_VERSION = "2026-04-14"
TILE_SIZE = 1024
MAX_LAT = 85.05112878
SEA_ATLAS_LEAFLET_ZOOM_OFFSET = -2
SEA_ATLAS_TILE_BOUNDS_LAT_EXPANSION = 1.8
SEA_ATLAS_TILE_BOUNDS_LON_EXPANSION = 4.0
SEA_ATLAS_TILE_BUFFER_COLUMNS = 2
SEA_ATLAS_TILE_BUFFER_ROWS = 2
SEA_ATLAS_LABEL_TILE_MARGIN = 240
SEA_ATLAS_LABEL_COLLISION_PADDING = 10
SEA_ATLAS_LABEL_COLLISION_PADDING_BY_KIND = {
    "country": 8,
    "region": 5,
    "city": 3,
    "sea": 5,
}
SEA_ATLAS_LABEL_KIND_ORDER = {
    "country": 0,
    "region": 1,
    "city": 2,
    "sea": 3,
}
SEA_ATLAS_AUTO_COUNTRY_LABEL_LIMIT = 2
SEA_ATLAS_AUTO_ADMIN1_LABEL_LIMIT = 4
SEA_ATLAS_AUTO_PLACE_LABEL_LIMIT = 4
SEA_ATLAS_MIN_PLACE_POPULATION = 12000
SEA_ATLAS_ALLOWED_PLACE_CLASSES = {
    "admin-0 capital",
    "admin-1 capital",
    "admin-0 capital alt",
    "admin-1 region capital",
    "populated place",
}
SEA_ATLAS_DEFAULT_FULL_BUILD_WORKERS = "auto"

SOURCE_FILES = {
    "land": {
        "path": SOURCE_DIR / "ne_10m_land.geojson",
        "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_land.geojson",
    },
    "countries": {
        "path": SOURCE_DIR / "ne_10m_admin_0_countries.geojson",
        "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_0_countries.geojson",
    },
    "admin1": {
        "path": SOURCE_DIR / "ne_10m_admin_1_states_provinces.geojson",
        "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson",
    },
    "places": {
        "path": SOURCE_DIR / "ne_10m_populated_places.geojson",
        "url": "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_populated_places.geojson",
    },
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
    "sans": [
        Path("C:/Windows/Fonts/msyh.ttc"),
        Path("C:/Windows/Fonts/simsun.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc"),
    ],
    "sans_bold": [
        Path("C:/Windows/Fonts/msyhbd.ttc"),
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"),
        Path("/usr/share/fonts/truetype/noto/NotoSansCJK-Bold.ttc"),
    ],
}


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def normalize_text(value: Any) -> str:
    text = str(value or "").strip()
    if text in {"", "-99", "None", "null", "NULL"}:
        return ""
    return text


def normalize_feature_class(value: Any) -> str:
    return normalize_text(value).strip().lower()


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


def project_lon_lat(lon: float, lat: float, z: int, x: int, y: int) -> Tuple[float, float]:
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


def mix_rgb(base: Tuple[int, int, int], tint: Tuple[int, int, int], amount: float) -> Tuple[int, int, int]:
    clamped_amount = clamp(amount, 0.0, 1.0)
    inverse = 1.0 - clamped_amount
    return (
        round(base[0] * inverse + tint[0] * clamped_amount),
        round(base[1] * inverse + tint[1] * clamped_amount),
        round(base[2] * inverse + tint[2] * clamped_amount),
    )


def ocean_color_for_lat(lat: float) -> Tuple[int, int, int]:
    top = (24, 81, 107)
    bottom = (6, 31, 48)
    ratio = mercator_ratio_for_lat(lat)
    return (
        round(top[0] + (bottom[0] - top[0]) * ratio),
        round(top[1] + (bottom[1] - top[1]) * ratio),
        round(top[2] + (bottom[2] - top[2]) * ratio),
    )


def lagoon_fill_for_ring(ring: Sequence[Tuple[float, float]]) -> Tuple[int, int, int, int]:
    south = min(pt[1] for pt in ring)
    north = max(pt[1] for pt in ring)
    ocean_rgb = ocean_color_for_lat((south + north) / 2.0)
    softened = mix_rgb(ocean_rgb, (78, 132, 154), 0.18)
    return (*softened, 228)


def stable_hash(value: str) -> int:
    return sum(ord(ch) for ch in str(value or ""))


def get_country_fill_color(country_code: str, is_primary: bool) -> Tuple[int, int, int, int]:
    if is_primary:
        return (124, 150, 142, 244)

    palette = [
        (102, 129, 134, 236),
        (119, 133, 118, 236),
        (95, 126, 118, 236),
        (128, 137, 118, 236),
        (106, 120, 138, 236),
        (113, 139, 122, 236),
    ]
    return palette[stable_hash(country_code) % len(palette)]


def get_country_boundary_color(is_primary: bool) -> Tuple[int, int, int, int]:
    return (212, 238, 244, 86) if is_primary else (188, 217, 226, 56)


def get_admin1_boundary_color(is_primary: bool) -> Tuple[int, int, int, int]:
    return (188, 224, 232, 38) if is_primary else (168, 200, 208, 20)


@lru_cache(maxsize=None)
def load_label_font(size: int, variant: str = "serif"):
    variant_keys = [variant] if variant in SEA_ATLAS_FONT_PATHS else []
    if "sans" not in variant_keys and variant.startswith("sans"):
        variant_keys.append("sans")
    if "serif" not in variant_keys and variant.startswith("serif"):
        variant_keys.append("serif")
    variant_keys.extend(["sans", "serif"])

    seen_paths = set()
    for key in variant_keys:
        for font_path in SEA_ATLAS_FONT_PATHS.get(key, []):
            if font_path in seen_paths:
                continue
            seen_paths.add(font_path)
            if font_path.exists():
                return ImageFont.truetype(str(font_path), size=max(12, int(size)))
    return ImageFont.load_default()


def get_label_visibility_limit(z: int) -> int:
    if z <= 4:
        return 3
    if z <= 5:
        return 5
    if z <= 6:
        return 7
    if z <= 7:
        return 10
    return 14


def get_context_label_style(kind: str, z: int) -> Dict[str, Any]:
    safe_kind = normalize_text(kind).lower() or "region"

    if safe_kind == "country":
        zh_size = 28 if z >= 8 else 24 if z >= 6 else 21 if z >= 5 else 18
        en_size = max(14, zh_size - 8)
        return {
            "zh_font": load_label_font(zh_size, "sans_bold"),
            "en_font": load_label_font(en_size, "serif_bold"),
            "single_font": load_label_font(zh_size, "sans_bold"),
            "fill": (240, 248, 252, 224),
            "stroke": (6, 24, 37, 154),
            "stroke_width": 2,
            "shadow": (2, 14, 24, 112),
            "shadow_offset": (0, 2),
            "line_gap": 2,
        }

    if safe_kind == "sea":
        zh_size = 20 if z >= 8 else 18 if z >= 6 else 16 if z >= 5 else 14
        en_size = zh_size + 2
        return {
            "zh_font": load_label_font(zh_size, "sans"),
            "en_font": load_label_font(en_size, "serif_italic"),
            "single_font": load_label_font(en_size, "serif_italic"),
            "fill": (202, 231, 240, 176),
            "stroke": (5, 20, 31, 118),
            "stroke_width": 1,
            "shadow": (2, 14, 24, 84),
            "shadow_offset": (0, 2),
            "line_gap": 2,
        }

    if safe_kind == "city":
        zh_size = 17 if z >= 8 else 15 if z >= 6 else 14 if z >= 5 else 12
        en_size = max(12, zh_size - 2)
        return {
            "zh_font": load_label_font(zh_size, "sans"),
            "en_font": load_label_font(en_size, "serif"),
            "single_font": load_label_font(zh_size, "sans"),
            "fill": (226, 240, 245, 176),
            "stroke": (5, 22, 34, 112),
            "stroke_width": 1,
            "shadow": (2, 14, 24, 76),
            "shadow_offset": (0, 2),
            "line_gap": 2,
        }

    zh_size = 22 if z >= 8 else 19 if z >= 6 else 17 if z >= 5 else 15
    en_size = max(14, zh_size - 6)
    return {
        "zh_font": load_label_font(zh_size, "sans"),
        "en_font": load_label_font(en_size, "serif"),
        "single_font": load_label_font(zh_size, "sans"),
        "fill": (222, 241, 248, 192),
        "stroke": (5, 22, 34, 122),
        "stroke_width": 1,
        "shadow": (2, 14, 24, 90),
        "shadow_offset": (0, 2),
        "line_gap": 3,
    }


def boxes_intersect(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> bool:
    return not (a[2] <= b[0] or a[0] >= b[2] or a[3] <= b[1] or a[1] >= b[3])


def measure_text_size(
    draw: ImageDraw.ImageDraw,
    text: str,
    font,
    stroke_width: int = 0,
) -> Tuple[float, float]:
    if hasattr(draw, "textbbox"):
        bbox = draw.textbbox((0, 0), text, font=font, anchor="la", stroke_width=stroke_width)
        return bbox[2] - bbox[0], bbox[3] - bbox[1]
    width, height = draw.textsize(text, font=font)
    return width + (stroke_width * 2), height + (stroke_width * 2)


def build_label_lines(label: Dict[str, Any], style: Dict[str, Any]) -> List[Dict[str, Any]]:
    name_zh = normalize_text(label.get("nameZh"))
    name_en = normalize_text(label.get("nameEn") or label.get("name"))
    if name_zh and name_en and name_zh != name_en:
        return [
            {"text": name_zh, "font": style["zh_font"]},
            {"text": name_en, "font": style["en_font"]},
        ]

    single_text = name_zh or name_en
    if not single_text:
        return []
    return [{"text": single_text, "font": style["single_font"]}]


def measure_label_block(
    draw: ImageDraw.ImageDraw,
    center: Tuple[float, float],
    lines: Sequence[Dict[str, Any]],
    stroke_width: int,
    line_gap: int,
) -> Tuple[Tuple[float, float, float, float], List[Dict[str, Any]]]:
    line_metrics: List[Dict[str, Any]] = []
    total_height = 0.0
    max_width = 0.0

    for line in lines:
        width, height = measure_text_size(draw, line["text"], line["font"], stroke_width)
        line_metrics.append({
            "text": line["text"],
            "font": line["font"],
            "width": width,
            "height": height,
        })
        total_height += height
        max_width = max(max_width, width)

    if len(line_metrics) > 1:
        total_height += line_gap * (len(line_metrics) - 1)

    center_x, center_y = center
    bbox = (
        center_x - (max_width / 2),
        center_y - (total_height / 2),
        center_x + (max_width / 2),
        center_y + (total_height / 2),
    )

    cursor_y = center_y - (total_height / 2)
    placed_lines: List[Dict[str, Any]] = []
    for metric in line_metrics:
        line_center_y = cursor_y + (metric["height"] / 2)
        placed_lines.append({
            "text": metric["text"],
            "font": metric["font"],
            "point": (center_x, line_center_y),
        })
        cursor_y += metric["height"] + line_gap

    return bbox, placed_lines


def get_label_collision_padding(kind: str, source: str, z: int) -> int:
    base = SEA_ATLAS_LABEL_COLLISION_PADDING_BY_KIND.get(kind, SEA_ATLAS_LABEL_COLLISION_PADDING)
    if source == "manual":
        base = max(1, base - 1)
    if z >= 8 and kind in {"region", "city"}:
        base = max(1, base - 1)
    return base


def get_label_candidate_centers(
    center: Tuple[float, float],
    bbox: Tuple[float, float, float, float],
    kind: str,
    source: str,
) -> List[Tuple[float, float]]:
    width = max(1.0, bbox[2] - bbox[0])
    height = max(1.0, bbox[3] - bbox[1])
    gap_x = max(18.0, width * (0.62 if kind == "country" else 0.46))
    gap_y = max(16.0, height * (0.9 if kind == "country" else 0.75))

    offsets: List[Tuple[float, float]] = [(0.0, 0.0)]
    if kind == "country":
        offsets.extend([
            (-gap_x, -gap_y * 0.1),
            (gap_x, gap_y * 0.1),
            (0.0, -gap_y),
            (0.0, gap_y),
            (-gap_x * 0.75, -gap_y * 0.85),
            (gap_x * 0.75, -gap_y * 0.85),
        ])
    elif kind == "sea":
        offsets.extend([
            (0.0, -gap_y * 0.75),
            (0.0, gap_y * 0.75),
            (-gap_x * 0.65, 0.0),
            (gap_x * 0.65, 0.0),
        ])
    else:
        offsets.extend([
            (0.0, -gap_y),
            (0.0, gap_y),
            (gap_x, 0.0),
            (-gap_x, 0.0),
            (gap_x * 0.82, -gap_y * 0.82),
            (-gap_x * 0.82, -gap_y * 0.82),
            (gap_x * 0.82, gap_y * 0.82),
            (-gap_x * 0.82, gap_y * 0.82),
        ])

    if source == "manual" and kind in {"region", "city"}:
        offsets.extend([
            (gap_x * 1.15, -gap_y * 0.18),
            (-gap_x * 1.15, -gap_y * 0.18),
            (gap_x * 1.15, gap_y * 0.3),
            (-gap_x * 1.15, gap_y * 0.3),
        ])

    seen = set()
    candidate_centers: List[Tuple[float, float]] = []
    for offset_x, offset_y in offsets:
        candidate = (round(center[0] + offset_x, 3), round(center[1] + offset_y, 3))
        if candidate in seen:
            continue
        seen.add(candidate)
        candidate_centers.append(candidate)
    return candidate_centers


def build_context_label_layout(
    draw: ImageDraw.ImageDraw,
    labels: Sequence[Dict[str, Any]],
    z: int,
    x: int,
    y: int,
) -> List[Dict[str, Any]]:
    if not labels:
        return []

    west = tile_x_to_lon(x, z)
    east = tile_x_to_lon(x + 1, z)
    north = tile_y_to_lat(y, z)
    south = tile_y_to_lat(y + 1, z)
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

        kind = normalize_text(label.get("kind")).lower() or "region"
        source = normalize_text(label.get("source")).lower() or "auto"
        style = get_context_label_style(kind, z)
        lines = build_label_lines(label, style)
        if not lines:
            continue

        px, py = project_lon_lat(lon, lat, z, x, y)
        base_bbox, _ = measure_label_block(
            draw,
            (px, py),
            lines,
            style["stroke_width"],
            style["line_gap"],
        )
        candidate_centers = get_label_candidate_centers((px, py), base_bbox, kind, source)
        candidates.append({
            "priority": priority,
            "source_order": 0 if source == "manual" else 1,
            "kind_order": SEA_ATLAS_LABEL_KIND_ORDER.get(kind, 9),
            "kind": kind,
            "source": source,
            "candidate_centers": candidate_centers,
            "lines_source": lines,
            "style": style,
            "sort_key": normalize_text(label.get("nameEn") or label.get("name") or label.get("nameZh")),
        })

    accepted = []
    collision_boxes: List[Tuple[float, float, float, float]] = []
    for candidate in sorted(
        candidates,
        key=lambda item: (item["priority"], item["source_order"], item["kind_order"], item["sort_key"]),
    ):
        placed_candidate = None
        collision_padding = get_label_collision_padding(candidate["kind"], candidate["source"], z)
        for center in candidate["candidate_centers"]:
            bbox, placed_lines = measure_label_block(
                draw,
                center,
                candidate["lines_source"],
                candidate["style"]["stroke_width"],
                candidate["style"]["line_gap"],
            )
            if (
                bbox[0] < -SEA_ATLAS_LABEL_TILE_MARGIN
                or bbox[1] < -SEA_ATLAS_LABEL_TILE_MARGIN
                or bbox[2] > TILE_SIZE + SEA_ATLAS_LABEL_TILE_MARGIN
                or bbox[3] > TILE_SIZE + SEA_ATLAS_LABEL_TILE_MARGIN
            ):
                continue

            expanded_box = (
                bbox[0] - collision_padding,
                bbox[1] - collision_padding,
                bbox[2] + collision_padding,
                bbox[3] + collision_padding,
            )
            if any(boxes_intersect(expanded_box, existing) for existing in collision_boxes):
                continue

            collision_boxes.append(expanded_box)
            placed_candidate = {
                **candidate,
                "bbox": bbox,
                "lines": placed_lines,
            }
            break

        if placed_candidate:
            accepted.append(placed_candidate)

    return accepted


def draw_context_labels(
    draw: ImageDraw.ImageDraw,
    labels: Sequence[Dict[str, Any]],
    z: int,
    x: int,
    y: int,
) -> None:
    for label in build_context_label_layout(draw, labels, z, x, y):
        style = label["style"]
        shadow_offset_x, shadow_offset_y = style["shadow_offset"]
        for line in label["lines"]:
            px, py = line["point"]
            draw.text(
                (px + shadow_offset_x, py + shadow_offset_y),
                line["text"],
                font=line["font"],
                fill=style["shadow"],
                anchor="mm",
            )
            draw.text(
                (px, py),
                line["text"],
                font=line["font"],
                fill=style["fill"],
                anchor="mm",
                stroke_width=style["stroke_width"],
                stroke_fill=style["stroke"],
            )


def expand_bounds(
    bounds: Sequence[Sequence[float]],
    lat_factor: float = SEA_ATLAS_TILE_BOUNDS_LAT_EXPANSION,
    lon_factor: float = SEA_ATLAS_TILE_BOUNDS_LON_EXPANSION,
) -> List[List[float]]:
    (south, west), (north, east) = bounds
    lat_pad = (north - south) * lat_factor
    lon_pad = (east - west) * lon_factor
    return [
        [south - lat_pad, west - lon_pad],
        [north + lat_pad, east + lon_pad],
    ]


def pad_bounds_by_tiles(
    bounds: Sequence[Sequence[float]],
    zoom: int,
    lat_tiles: float = SEA_ATLAS_TILE_BUFFER_ROWS,
    lon_tiles: float = SEA_ATLAS_TILE_BUFFER_COLUMNS,
) -> List[List[float]]:
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


def bounds_to_bbox(bounds: Sequence[Sequence[float]]) -> Tuple[float, float, float, float]:
    (south, west), (north, east) = bounds
    return west, south, east, north


def bbox_intersects(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]) -> bool:
    return not (a[2] < b[0] or a[0] > b[2] or a[3] < b[1] or a[1] > b[3])


def combine_bboxes(boxes: Sequence[Tuple[float, float, float, float]]) -> Optional[Tuple[float, float, float, float]]:
    if not boxes:
        return None
    return (
        min(box[0] for box in boxes),
        min(box[1] for box in boxes),
        max(box[2] for box in boxes),
        max(box[3] for box in boxes),
    )


def ring_bbox(ring: Sequence[Tuple[float, float]]) -> Tuple[float, float, float, float]:
    lons = [pt[0] for pt in ring]
    lats = [pt[1] for pt in ring]
    return min(lons), min(lats), max(lons), max(lats)


def normalize_ring(raw_ring: Sequence[Sequence[float]]) -> List[Tuple[float, float]]:
    ring = []
    for lon, lat, *_ in raw_ring:
        ring.append((float(lon), clamp(float(lat), -MAX_LAT, MAX_LAT)))
    return ring


def derive_label_point(
    properties: Dict[str, Any],
    fallback_bbox: Optional[Tuple[float, float, float, float]] = None,
) -> Optional[Tuple[float, float]]:
    lon = properties.get("LABEL_X")
    lat = properties.get("LABEL_Y")
    if lon is None or lat is None:
        lon = properties.get("longitude")
        lat = properties.get("latitude")
    if lon is None or lat is None:
        lon = properties.get("LONGITUDE")
        lat = properties.get("LATITUDE")
    if lon is None or lat is None:
        lon = properties.get("label_x")
        lat = properties.get("label_y")
    if lon is None or lat is None:
        lon = properties.get("lon")
        lat = properties.get("lat")

    if lon is not None and lat is not None:
        try:
            return float(lon), float(lat)
        except (TypeError, ValueError):
            pass

    if fallback_bbox:
        west, south, east, north = fallback_bbox
        return ((west + east) / 2.0, (south + north) / 2.0)
    return None


def get_catalog_spots() -> List[Dict[str, Any]]:
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


def ensure_source_file(source_key: str) -> Path:
    definition = SOURCE_FILES[source_key]
    path = definition["path"]
    if path.exists():
        return path

    if requests is None:
        raise RuntimeError(
            f"requests is required to download {path.name} when the local source file is missing"
        )

    SOURCE_DIR.mkdir(parents=True, exist_ok=True)
    response = requests.get(definition["url"], timeout=60)
    response.raise_for_status()
    path.write_bytes(response.content)
    return path


def load_geojson(source_key: str) -> Dict[str, Any]:
    path = ensure_source_file(source_key)
    return json.loads(path.read_text(encoding="utf-8"))


def load_polygon_features(source_key: str) -> List[Dict[str, Any]]:
    data = load_geojson(source_key)
    features: List[Dict[str, Any]] = []

    for feature in data.get("features", []):
        geometry = feature.get("geometry") or {}
        properties = feature.get("properties") or {}
        geom_type = geometry.get("type")
        coordinates = geometry.get("coordinates") or []

        if geom_type == "Polygon":
            polygon_sets = [coordinates]
        elif geom_type == "MultiPolygon":
            polygon_sets = coordinates
        else:
            continue

        polygons = []
        polygon_boxes = []
        for polygon in polygon_sets:
            if not polygon:
                continue
            outer = normalize_ring(polygon[0])
            if len(outer) < 3:
                continue
            holes = [normalize_ring(ring) for ring in polygon[1:] if len(ring) >= 3]
            bbox = ring_bbox(outer)
            polygon_boxes.append(bbox)
            polygons.append({
                "outer": outer,
                "holes": holes,
                "bbox": bbox,
            })

        if not polygons:
            continue

        feature_bbox = combine_bboxes(polygon_boxes)
        features.append({
            "polygons": polygons,
            "bbox": feature_bbox,
            "label_point": derive_label_point(properties, feature_bbox),
            "properties": properties,
        })

    return features


def load_point_features(source_key: str) -> List[Dict[str, Any]]:
    data = load_geojson(source_key)
    points: List[Dict[str, Any]] = []
    for feature in data.get("features", []):
        geometry = feature.get("geometry") or {}
        properties = feature.get("properties") or {}
        if geometry.get("type") != "Point":
            continue
        coordinates = geometry.get("coordinates") or []
        if len(coordinates) < 2:
            continue
        lon = float(coordinates[0])
        lat = clamp(float(coordinates[1]), -MAX_LAT, MAX_LAT)
        points.append({
            "coords": (lon, lat),
            "bbox": (lon, lat, lon, lat),
            "label_point": (lon, lat),
            "properties": properties,
        })
    return points


@lru_cache(maxsize=1)
def load_source_data() -> Dict[str, Any]:
    return {
        "land": load_polygon_features("land"),
        "countries": load_polygon_features("countries"),
        "admin1": load_polygon_features("admin1"),
        "places": load_point_features("places"),
    }


def get_country_code(properties: Dict[str, Any]) -> str:
    return normalize_text(
        properties.get("ISO_A2")
        or properties.get("iso_a2")
        or properties.get("WB_A2")
        or properties.get("ADM0_A3")
        or properties.get("ADM0_A3_US")
        or properties.get("ADM0_A3_UN")
        or properties.get("SOV_A3")
    ).upper()


def get_country_name_zh(properties: Dict[str, Any]) -> str:
    return normalize_text(properties.get("NAME_ZH") or properties.get("name_zh"))


def get_country_name_en(properties: Dict[str, Any]) -> str:
    return normalize_text(
        properties.get("NAME_EN")
        or properties.get("NAME_LONG")
        or properties.get("ADMIN")
        or properties.get("NAME")
        or properties.get("name_en")
        or properties.get("name")
    )


def get_admin1_name_zh(properties: Dict[str, Any]) -> str:
    return normalize_text(properties.get("name_zh") or properties.get("NAME_ZH"))


def get_admin1_name_en(properties: Dict[str, Any]) -> str:
    return normalize_text(
        properties.get("name_en")
        or properties.get("name")
        or properties.get("gn_name")
        or properties.get("woe_name")
    )


def get_place_name_zh(properties: Dict[str, Any]) -> str:
    return normalize_text(properties.get("NAME_ZH") or properties.get("name_zh"))


def get_place_name_en(properties: Dict[str, Any]) -> str:
    return normalize_text(
        properties.get("NAME_EN")
        or properties.get("NAME")
        or properties.get("NAMEASCII")
    )


def get_numeric_property(properties: Dict[str, Any], *keys: str, default: float = 0.0) -> float:
    for key in keys:
        value = properties.get(key)
        if value in (None, ""):
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return default


def filter_polygon_features(
    features: Sequence[Dict[str, Any]],
    bounds: Sequence[Sequence[float]],
) -> List[Dict[str, Any]]:
    target_bbox = bounds_to_bbox(bounds)
    return [feature for feature in features if feature.get("bbox") and bbox_intersects(feature["bbox"], target_bbox)]


def filter_point_features(
    features: Sequence[Dict[str, Any]],
    bounds: Sequence[Sequence[float]],
) -> List[Dict[str, Any]]:
    target_bbox = bounds_to_bbox(bounds)
    return [feature for feature in features if feature.get("bbox") and bbox_intersects(feature["bbox"], target_bbox)]


def normalize_context_label(label: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    coords = label.get("coords") or []
    if len(coords) != 2:
        return None

    name_zh = normalize_text(label.get("nameZh"))
    name_en = normalize_text(label.get("nameEn") or label.get("name"))
    if not name_zh and not name_en:
        return None

    try:
        lat = float(coords[0])
        lon = float(coords[1])
    except (TypeError, ValueError):
        return None

    return {
        "nameZh": name_zh,
        "nameEn": name_en,
        "name": name_en or name_zh,
        "kind": normalize_text(label.get("kind")).lower() or "region",
        "coords": [lat, lon],
        "priority": int(label.get("priority") or 99),
        "source": normalize_text(label.get("source")).lower() or "auto",
    }


def label_identity_key(label: Dict[str, Any]) -> str:
    name_zh = normalize_text(label.get("nameZh")).lower()
    name_en = normalize_text(label.get("nameEn") or label.get("name")).lower()
    return f"{name_zh}|{name_en}"


def build_country_auto_labels(
    spot: Dict[str, Any],
    countries: Sequence[Dict[str, Any]],
    manual_keys: set,
) -> List[Dict[str, Any]]:
    primary_country_code = normalize_text(spot.get("primaryCountryCode")).upper()
    candidates = []
    for feature in countries:
        properties = feature["properties"]
        label_point = feature.get("label_point")
        if not label_point:
            continue

        country_code = get_country_code(properties)
        label = {
            "nameZh": get_country_name_zh(properties),
            "nameEn": get_country_name_en(properties),
            "kind": "country",
            "coords": [label_point[1], label_point[0]],
            "priority": 1 if country_code == primary_country_code else 4,
        }
        normalized = normalize_context_label(label)
        if not normalized:
            continue
        if label_identity_key(normalized) in manual_keys:
            continue

        label_rank = int(get_numeric_property(properties, "LABELRANK", default=5))
        area_hint = 0.0
        bbox = feature.get("bbox")
        if bbox:
            area_hint = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        candidates.append({
            "label": normalized,
            "is_primary": country_code == primary_country_code,
            "label_rank": label_rank,
            "area_hint": area_hint,
        })

    candidates.sort(
        key=lambda item: (
            0 if item["is_primary"] else 1,
            item["label_rank"],
            -item["area_hint"],
            item["label"]["nameEn"],
        )
    )

    selected = []
    for item in candidates:
        if len(selected) >= SEA_ATLAS_AUTO_COUNTRY_LABEL_LIMIT:
            break
        selected.append(item["label"])
        manual_keys.add(label_identity_key(item["label"]))
    return selected


def build_admin1_auto_labels(
    spot: Dict[str, Any],
    admin1_features: Sequence[Dict[str, Any]],
    manual_keys: set,
) -> List[Dict[str, Any]]:
    primary_country_code = normalize_text(spot.get("primaryCountryCode")).upper()
    candidates = []
    for feature in admin1_features:
        properties = feature["properties"]
        country_code = get_country_code(properties)
        if primary_country_code and country_code and country_code != primary_country_code:
            continue

        label_point = feature.get("label_point")
        if not label_point:
            continue

        normalized = normalize_context_label({
            "nameZh": get_admin1_name_zh(properties),
            "nameEn": get_admin1_name_en(properties),
            "kind": "region",
            "coords": [label_point[1], label_point[0]],
            "priority": 5,
        })
        if not normalized or label_identity_key(normalized) in manual_keys:
            continue

        label_rank = int(get_numeric_property(properties, "labelrank", "LABELRANK", default=5))
        area_hint = 0.0
        bbox = feature.get("bbox")
        if bbox:
            area_hint = (bbox[2] - bbox[0]) * (bbox[3] - bbox[1])
        candidates.append({
            "label": normalized,
            "label_rank": label_rank,
            "area_hint": area_hint,
        })

    candidates.sort(key=lambda item: (item["label_rank"], -item["area_hint"], item["label"]["nameEn"]))
    selected = []
    for item in candidates:
        if len(selected) >= SEA_ATLAS_AUTO_ADMIN1_LABEL_LIMIT:
            break
        selected.append(item["label"])
        manual_keys.add(label_identity_key(item["label"]))
    return selected


def build_place_auto_labels(
    spot: Dict[str, Any],
    places: Sequence[Dict[str, Any]],
    manual_keys: set,
) -> List[Dict[str, Any]]:
    primary_country_code = normalize_text(spot.get("primaryCountryCode")).upper()
    candidates = []
    for feature in places:
        properties = feature["properties"]
        country_code = normalize_text(properties.get("ISO_A2") or properties.get("ADM0_A3")).upper()
        if primary_country_code and country_code and country_code != primary_country_code:
            continue

        feature_class = normalize_feature_class(properties.get("FEATURECLA"))
        population = get_numeric_property(properties, "POP_MAX", "POP_MIN", default=0)
        if feature_class not in SEA_ATLAS_ALLOWED_PLACE_CLASSES and population < SEA_ATLAS_MIN_PLACE_POPULATION:
            continue

        label_point = feature.get("label_point")
        if not label_point:
            continue

        normalized = normalize_context_label({
            "nameZh": get_place_name_zh(properties),
            "nameEn": get_place_name_en(properties),
            "kind": "city",
            "coords": [label_point[1], label_point[0]],
            "priority": 6,
        })
        if not normalized or label_identity_key(normalized) in manual_keys:
            continue

        label_rank = int(get_numeric_property(properties, "LABELRANK", default=8))
        candidates.append({
            "label": normalized,
            "label_rank": label_rank,
            "population": population,
            "feature_class": feature_class,
        })

    candidates.sort(
        key=lambda item: (
            item["label_rank"],
            0 if "capital" in item["feature_class"] else 1,
            -item["population"],
            item["label"]["nameEn"],
        )
    )

    selected = []
    for item in candidates:
        if len(selected) >= SEA_ATLAS_AUTO_PLACE_LABEL_LIMIT:
            break
        selected.append(item["label"])
        manual_keys.add(label_identity_key(item["label"]))
    return selected


def build_context_labels_for_spot(
    spot: Dict[str, Any],
    filtered_sources: Dict[str, Any],
) -> List[Dict[str, Any]]:
    manual_labels = []
    manual_keys = set()
    for raw_label in spot.get("contextLabels") or []:
        normalized = normalize_context_label(raw_label)
        if not normalized:
            continue
        normalized["source"] = "manual"
        manual_labels.append(normalized)
        manual_keys.add(label_identity_key(normalized))

    auto_labels = []
    auto_labels.extend(build_country_auto_labels(spot, filtered_sources["countries"], manual_keys))
    auto_labels.extend(build_admin1_auto_labels(spot, filtered_sources["admin1"], manual_keys))
    auto_labels.extend(build_place_auto_labels(spot, filtered_sources["places"], manual_keys))

    combined = manual_labels + auto_labels
    combined.sort(
        key=lambda item: (
            int(item.get("priority") or 99),
            0 if item.get("source") == "manual" else 1,
            SEA_ATLAS_LABEL_KIND_ORDER.get(item.get("kind"), 9),
            normalize_text(item.get("nameEn") or item.get("name") or item.get("nameZh")),
        )
    )
    return combined


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


def draw_land_base(draw: ImageDraw.ImageDraw, land_polygons: Sequence[Dict[str, Any]], tile_bbox, z: int, x: int, y: int) -> None:
    base_fill = (96, 120, 116, 208)
    for feature in land_polygons:
        for polygon in feature["polygons"]:
            if not bbox_intersects(polygon["bbox"], tile_bbox):
                continue
            outer = [project_lon_lat(lon, lat, z, x, y) for lon, lat in polygon["outer"]]
            if len(outer) >= 3:
                draw.polygon(outer, fill=base_fill)


def draw_country_polygons(
    draw: ImageDraw.ImageDraw,
    countries: Sequence[Dict[str, Any]],
    primary_country_code: str,
    tile_bbox,
    z: int,
    x: int,
    y: int,
) -> None:
    for feature in countries:
        country_code = get_country_code(feature["properties"])
        fill = get_country_fill_color(country_code, country_code == primary_country_code)
        for polygon in feature["polygons"]:
            if not bbox_intersects(polygon["bbox"], tile_bbox):
                continue
            outer = [project_lon_lat(lon, lat, z, x, y) for lon, lat in polygon["outer"]]
            if len(outer) < 3:
                continue
            draw.polygon(outer, fill=fill)

            for hole in polygon["holes"]:
                if z <= 6:
                    continue
                hole_points = [project_lon_lat(lon, lat, z, x, y) for lon, lat in hole]
                if len(hole_points) < 3:
                    continue
                draw.polygon(hole_points, fill=lagoon_fill_for_ring(hole))


def draw_admin1_boundaries(
    draw: ImageDraw.ImageDraw,
    admin1_features: Sequence[Dict[str, Any]],
    primary_country_code: str,
    tile_bbox,
    z: int,
    x: int,
    y: int,
) -> None:
    for feature in admin1_features:
        country_code = get_country_code(feature["properties"])
        is_primary = country_code == primary_country_code
        line_color = get_admin1_boundary_color(is_primary)
        line_width = 2 if is_primary and z >= 7 else 1
        for polygon in feature["polygons"]:
            if not bbox_intersects(polygon["bbox"], tile_bbox):
                continue
            outer = [project_lon_lat(lon, lat, z, x, y) for lon, lat in polygon["outer"]]
            if len(outer) >= 2:
                draw.line(outer, fill=line_color, width=line_width)


def draw_country_boundaries(
    draw: ImageDraw.ImageDraw,
    countries: Sequence[Dict[str, Any]],
    primary_country_code: str,
    tile_bbox,
    z: int,
    x: int,
    y: int,
) -> None:
    for feature in countries:
        country_code = get_country_code(feature["properties"])
        line_color = get_country_boundary_color(country_code == primary_country_code)
        line_width = 2 if z >= 6 else 1
        for polygon in feature["polygons"]:
            if not bbox_intersects(polygon["bbox"], tile_bbox):
                continue
            outer = [project_lon_lat(lon, lat, z, x, y) for lon, lat in polygon["outer"]]
            if len(outer) >= 2:
                draw.line(outer, fill=line_color, width=line_width)


def draw_land_coastline(
    draw: ImageDraw.ImageDraw,
    land_polygons: Sequence[Dict[str, Any]],
    tile_bbox,
    z: int,
    x: int,
    y: int,
) -> None:
    land_shadow = (214, 242, 247, 36)
    coast_line = (222, 243, 248, 120)

    for feature in land_polygons:
        for polygon in feature["polygons"]:
            if not bbox_intersects(polygon["bbox"], tile_bbox):
                continue

            outer = [project_lon_lat(lon, lat, z, x, y) for lon, lat in polygon["outer"]]
            if len(outer) < 3:
                continue

            draw.line(outer, fill=land_shadow, width=5)
            draw.line(outer, fill=coast_line, width=2)

            for hole in polygon["holes"]:
                if z <= 6:
                    continue
                hole_points = [project_lon_lat(lon, lat, z, x, y) for lon, lat in hole]
                if len(hole_points) < 3:
                    continue
                draw.line(hole_points, fill=(194, 229, 238, 28), width=1)


def render_tile_bytes(
    prepared_sources: Dict[str, Any],
    context_labels: Sequence[Dict[str, Any]],
    spot: Dict[str, Any],
    z: int,
    x: int,
    y: int,
) -> bytes:
    image = Image.new("RGBA", (TILE_SIZE, TILE_SIZE))
    draw = ImageDraw.Draw(image, "RGBA")
    draw_ocean(draw, z, x, y)
    draw_graticule(draw, z, x, y)

    west = tile_x_to_lon(x, z)
    east = tile_x_to_lon(x + 1, z)
    north = tile_y_to_lat(y, z)
    south = tile_y_to_lat(y + 1, z)
    tile_bbox = (west, south, east, north)
    primary_country_code = normalize_text(spot.get("primaryCountryCode")).upper()

    draw_land_base(draw, prepared_sources["land"], tile_bbox, z, x, y)
    draw_country_polygons(draw, prepared_sources["countries"], primary_country_code, tile_bbox, z, x, y)
    draw_admin1_boundaries(draw, prepared_sources["admin1"], primary_country_code, tile_bbox, z, x, y)
    draw_country_boundaries(draw, prepared_sources["countries"], primary_country_code, tile_bbox, z, x, y)
    draw_land_coastline(draw, prepared_sources["land"], tile_bbox, z, x, y)
    draw_context_labels(draw, context_labels, z, x, y)

    output = io.BytesIO()
    image.save(output, format="WEBP", quality=86, method=6)
    return output.getvalue()


def tile_range_for_bounds(bounds: Sequence[Sequence[float]], z: int) -> Tuple[int, int, int, int]:
    (south, west), (north, east) = bounds
    epsilon = 1e-9
    x_start = lon_to_tile_x(west, z)
    x_end = lon_to_tile_x(east - epsilon, z)
    y_start = lat_to_tile_y(north, z)
    y_end = lat_to_tile_y(south + epsilon, z)
    return x_start, x_end, y_start, y_end


def ensure_packs_root() -> None:
    PACKS_ROOT.mkdir(parents=True, exist_ok=True)


def reset_packs_root() -> None:
    if PACKS_ROOT.exists():
        shutil.rmtree(PACKS_ROOT)
    PACKS_ROOT.mkdir(parents=True, exist_ok=True)


def compute_spot_bounds(spot: Dict[str, Any]) -> List[List[float]]:
    zoom = int(spot["zoom"])
    bounds = expand_bounds(
        spot["mapBounds"],
        SEA_ATLAS_TILE_BOUNDS_LAT_EXPANSION,
        SEA_ATLAS_TILE_BOUNDS_LON_EXPANSION,
    )
    return pad_bounds_by_tiles(
        bounds,
        zoom,
        SEA_ATLAS_TILE_BUFFER_ROWS,
        SEA_ATLAS_TILE_BUFFER_COLUMNS,
    )


def build_spot_manifest(
    spot: Dict[str, Any],
    bounds: Sequence[Sequence[float]],
    tile_count: int,
    build_seconds: float,
) -> Dict[str, Any]:
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
        "buildSeconds": round(build_seconds, 3),
    }


def build_index_base() -> Dict[str, Any]:
    return {
        "version": SEA_ATLAS_INDEX_VERSION,
        "generator": "tools/maps/generate-sea-atlas-tiles.py",
        "packFormat": SEA_ATLAS_PACK_FORMAT,
        "tileSize": TILE_SIZE,
        "zoomOffset": SEA_ATLAS_LEAFLET_ZOOM_OFFSET,
        "generatedAt": "",
        "spots": [],
    }


def load_existing_index() -> Dict[str, Any]:
    if not INDEX_PATH.exists():
        return build_index_base()

    try:
        data = json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return build_index_base()

    base = build_index_base()
    for key in ("version", "generator", "packFormat", "tileSize", "zoomOffset"):
        if key in data:
            base[key] = data[key]
    base["spots"] = data.get("spots") or []
    return base


def merge_spot_manifests(
    existing_spots: Sequence[Dict[str, Any]],
    updated_manifests: Dict[str, Dict[str, Any]],
    catalog_order: Sequence[str],
    full_build: bool,
) -> List[Dict[str, Any]]:
    merged = {item["key"]: item for item in existing_spots if item.get("key")}
    merged.update(updated_manifests)
    if full_build:
        return [updated_manifests[key] for key in catalog_order if key in updated_manifests]
    return [merged[key] for key in catalog_order if key in merged]


def write_index_manifest(
    updated_manifests: Dict[str, Dict[str, Any]],
    catalog_order: Sequence[str],
    full_build: bool,
) -> Dict[str, Any]:
    index_manifest = build_index_base() if full_build else load_existing_index()
    index_manifest["version"] = SEA_ATLAS_INDEX_VERSION
    index_manifest["generatedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    index_manifest["spots"] = merge_spot_manifests(
        index_manifest.get("spots") or [],
        updated_manifests,
        catalog_order,
        full_build,
    )
    INDEX_PATH.write_text(json.dumps(index_manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return index_manifest


def prepare_spot_sources(spot: Dict[str, Any]) -> Dict[str, Any]:
    source_data = load_source_data()
    bounds = compute_spot_bounds(spot)
    filtered_sources = {
        "land": filter_polygon_features(source_data["land"], bounds),
        "countries": filter_polygon_features(source_data["countries"], bounds),
        "admin1": filter_polygon_features(source_data["admin1"], bounds),
        "places": filter_point_features(source_data["places"], bounds),
    }
    filtered_sources["context_labels"] = build_context_labels_for_spot(spot, filtered_sources)
    filtered_sources["bounds"] = bounds
    return filtered_sources


def build_pack_for_spot(spot: Dict[str, Any]) -> Dict[str, Any]:
    started_at = time.perf_counter()
    key = spot["key"]
    prepared = prepare_spot_sources(spot)
    bounds = prepared["bounds"]
    zoom = int(spot["zoom"])
    logical_min_zoom = max(4, zoom - 4)
    logical_max_zoom = min(13, zoom + 2)
    storage_min_zoom = max(0, logical_min_zoom + SEA_ATLAS_LEAFLET_ZOOM_OFFSET)
    storage_max_zoom = max(storage_min_zoom, logical_max_zoom + SEA_ATLAS_LEAFLET_ZOOM_OFFSET)

    ensure_packs_root()
    pack_path = PACKS_ROOT / f"{key}.pack.js"
    if pack_path.exists():
        pack_path.unlink()

    tile_count = 0
    tile_payload: Dict[str, str] = {}
    for z in range(storage_min_zoom, storage_max_zoom + 1):
        x_start, x_end, y_start, y_end = tile_range_for_bounds(bounds, z)
        for x in range(x_start, x_end + 1):
            for y in range(y_start, y_end + 1):
                tile_bytes = render_tile_bytes(prepared, prepared["context_labels"], spot, z, x, y)
                tile_payload[f"{z}/{x}/{y}.webp"] = base64.b64encode(tile_bytes).decode("ascii")
                tile_count += 1

    elapsed_seconds = time.perf_counter() - started_at
    manifest = build_spot_manifest(spot, bounds, tile_count, elapsed_seconds)
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
    return {
        "key": key,
        "manifest": manifest,
        "tileCount": tile_count,
        "elapsedSeconds": elapsed_seconds,
        "packPath": str(pack_path),
    }


def build_pack_for_spot_worker(spot: Dict[str, Any]) -> Dict[str, Any]:
    return build_pack_for_spot(spot)


def parse_workers(raw_value: str, spot_count: int) -> int:
    if spot_count <= 1:
        return 1
    if str(raw_value or "").strip().lower() == "auto":
        cpu_count = os.cpu_count() or 2
        return max(1, min(6, cpu_count - 1, spot_count))
    try:
        return max(1, min(int(raw_value), spot_count))
    except (TypeError, ValueError):
        raise ValueError(f"Invalid --workers value: {raw_value}")


def build_packs_for_spots(
    target_spots: Sequence[Dict[str, Any]],
    workers: int,
) -> Dict[str, Dict[str, Any]]:
    results: Dict[str, Dict[str, Any]] = {}
    if workers <= 1 or len(target_spots) <= 1:
        for spot in target_spots:
            result = build_pack_for_spot(spot)
            results[result["key"]] = result["manifest"]
            print(
                f"generated {result['key']}: {result['tileCount']} packed tiles "
                f"in {result['elapsedSeconds']:.2f}s"
            )
        return results

    with ProcessPoolExecutor(max_workers=workers) as executor:
        futures = {
            executor.submit(build_pack_for_spot_worker, spot): spot["key"]
            for spot in target_spots
        }
        for future in as_completed(futures):
            result = future.result()
            results[result["key"]] = result["manifest"]
            print(
                f"generated {result['key']}: {result['tileCount']} packed tiles "
                f"in {result['elapsedSeconds']:.2f}s"
            )
    return results


def resolve_target_spots(args, all_spots: Sequence[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], bool]:
    requested_keys: List[str] = []
    if args.spot:
        requested_keys.extend(args.spot)
    if args.spots:
        requested_keys.extend(item.strip() for item in args.spots.split(",") if item.strip())

    all_keys = [spot["key"] for spot in all_spots]
    spot_by_key = {spot["key"]: spot for spot in all_spots}

    if args.all or not requested_keys:
        return list(all_spots), True

    deduped_keys = []
    seen = set()
    for key in requested_keys:
        if key not in seen:
            seen.add(key)
            deduped_keys.append(key)

    invalid_keys = [key for key in deduped_keys if key not in spot_by_key]
    if invalid_keys:
        raise ValueError(f"Unknown sea atlas spot keys: {', '.join(invalid_keys)}")

    return [spot_by_key[key] for key in deduped_keys], False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate offline Yanqi sea-atlas tile packs.")
    parser.add_argument("--spot", action="append", help="Generate one spot pack (repeatable).")
    parser.add_argument("--spots", help="Generate comma-separated spot packs.")
    parser.add_argument("--all", action="store_true", help="Generate all spot packs.")
    parser.add_argument(
        "--workers",
        default=SEA_ATLAS_DEFAULT_FULL_BUILD_WORKERS,
        help="Worker count for full builds. Use an integer or 'auto'.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    all_spots = get_catalog_spots()
    target_spots, full_build = resolve_target_spots(args, all_spots)
    workers = parse_workers(args.workers, len(target_spots))

    started_at = time.perf_counter()
    if full_build:
        reset_packs_root()
    else:
        ensure_packs_root()

    updated_manifests = build_packs_for_spots(target_spots, workers)
    catalog_order = [spot["key"] for spot in all_spots]
    index_manifest = write_index_manifest(updated_manifests, catalog_order, full_build)

    total_seconds = time.perf_counter() - started_at
    total_tiles = sum(int(item.get("tileCount") or 0) for item in index_manifest.get("spots") or [])
    print(f"wrote {INDEX_PATH.relative_to(ROOT)}")
    print(
        f"sea atlas build complete: mode={'all' if full_build else 'incremental'}, "
        f"spots={len(target_spots)}, workers={workers}, totalTiles={total_tiles}, "
        f"elapsed={total_seconds:.2f}s"
    )


if __name__ == "__main__":
    main()
