#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE_ROOT = path.join(ROOT, 'site');
const CATALOG_PATH = path.join(SITE_ROOT, 'js', 'yanqi-spot-map-catalog.js');
const INDEX_PATH = path.join(SITE_ROOT, 'assets', 'maps', 'packs', 'index.json');
const DEFAULT_OUT_DIR = path.join(__dirname, 'out', 'sea-atlas-mosaics');
const TILE_SIZE = 1024;
const MAX_LAT = 85.05112878;

function parseArgs(argv) {
  const options = {
    spots: [],
    all: false,
    outDir: DEFAULT_OUT_DIR,
    width: 1600,
    height: 900,
    latExpand: 0.5,
    lonExpand: 0.5,
    zoom: 'auto',
    overwrite: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all') {
      options.all = true;
      continue;
    }
    if (arg === '--spot' && argv[i + 1]) {
      options.spots.push(argv[i + 1].trim());
      i += 1;
      continue;
    }
    if (arg.startsWith('--spots=')) {
      const value = arg.slice('--spots='.length);
      value.split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => options.spots.push(item));
      continue;
    }
    if (arg === '--spots' && argv[i + 1]) {
      argv[i + 1].split(',').map((item) => item.trim()).filter(Boolean).forEach((item) => options.spots.push(item));
      i += 1;
      continue;
    }
    if (arg === '--out-dir' && argv[i + 1]) {
      options.outDir = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--out-dir=')) {
      options.outDir = path.resolve(arg.slice('--out-dir='.length));
      continue;
    }
    if (arg === '--width' && argv[i + 1]) {
      options.width = Math.max(256, Number(argv[i + 1]) || 1600);
      i += 1;
      continue;
    }
    if (arg.startsWith('--width=')) {
      options.width = Math.max(256, Number(arg.slice('--width='.length)) || 1600);
      continue;
    }
    if (arg === '--height' && argv[i + 1]) {
      options.height = Math.max(256, Number(argv[i + 1]) || 900);
      i += 1;
      continue;
    }
    if (arg.startsWith('--height=')) {
      options.height = Math.max(256, Number(arg.slice('--height='.length)) || 900);
      continue;
    }
    if (arg === '--lat-expand' && argv[i + 1]) {
      options.latExpand = Math.max(0, Number(argv[i + 1]) || 0.5);
      i += 1;
      continue;
    }
    if (arg.startsWith('--lat-expand=')) {
      options.latExpand = Math.max(0, Number(arg.slice('--lat-expand='.length)) || 0.5);
      continue;
    }
    if (arg === '--lon-expand' && argv[i + 1]) {
      options.lonExpand = Math.max(0, Number(argv[i + 1]) || 0.5);
      i += 1;
      continue;
    }
    if (arg.startsWith('--lon-expand=')) {
      options.lonExpand = Math.max(0, Number(arg.slice('--lon-expand='.length)) || 0.5);
      continue;
    }
    if (arg === '--zoom' && argv[i + 1]) {
      options.zoom = argv[i + 1].trim();
      i += 1;
      continue;
    }
    if (arg.startsWith('--zoom=')) {
      options.zoom = arg.slice('--zoom='.length).trim();
      continue;
    }
    if (arg === '--no-overwrite') {
      options.overwrite = false;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelpAndExit(0);
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function printHelpAndExit(code) {
  process.stdout.write(
    [
      'Usage: node tools/qa/sea-atlas-first-view-mosaic.cjs [options]',
      '',
      'Options:',
      '  --all                      Generate mosaics for all spots in index.json',
      '  --spot <key>               Generate a mosaic for one spot (repeatable)',
      '  --spots <k1,k2,...>        Generate mosaics for comma-separated spots',
      '  --out-dir <path>           Output folder (default: tools/qa/out/sea-atlas-mosaics)',
      '  --width <px>               Preview width (default: 1600)',
      '  --height <px>              Preview height (default: 900)',
      '  --lat-expand <ratio>       First-view latitude expansion ratio (default: 0.5)',
      '  --lon-expand <ratio>       First-view longitude expansion ratio (default: 0.5)',
      '  --zoom <auto|number>       Tile zoom (default: auto)',
      '  --no-overwrite             Skip output file if it already exists',
      '',
      'Examples:',
      '  node tools/qa/sea-atlas-first-view-mosaic.cjs --spot mabul',
      '  node tools/qa/sea-atlas-first-view-mosaic.cjs --spots mabul,sipadan,racha --width 1920 --height 1080',
    ].join('\n')
  );
  process.exit(code);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lonToTileX(lon, z) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  return clamp(Math.floor(x), 0, n - 1);
}

function latToTileY(lat, z) {
  const n = 2 ** z;
  const clamped = clamp(lat, -MAX_LAT, MAX_LAT);
  const rad = (clamped * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(rad) + (1 / Math.cos(rad))) / Math.PI) / 2) * n;
  return clamp(Math.floor(y), 0, n - 1);
}

function expandBounds(bounds, latRatio, lonRatio) {
  const [[south, west], [north, east]] = bounds;
  const latSpan = Math.max(1e-8, north - south);
  const lonSpan = Math.max(1e-8, east - west);
  return [
    [clamp(south - latSpan * latRatio, -MAX_LAT, MAX_LAT), west - lonSpan * lonRatio],
    [clamp(north + latSpan * latRatio, -MAX_LAT, MAX_LAT), east + lonSpan * lonRatio],
  ];
}

function chooseTileZoom(spot, manifest, availableZooms, requestedZoom) {
  if (!availableZooms.length) {
    throw new Error(`No tile zooms available for ${spot.key}`);
  }
  if (requestedZoom !== 'auto') {
    const parsed = Number(requestedZoom);
    if (Number.isFinite(parsed)) {
      return nearestZoom(availableZooms, parsed);
    }
    throw new Error(`Invalid --zoom value: ${requestedZoom}`);
  }
  const baseLeafletZoom = Number(spot.zoom) || Number(manifest.offlineMaxZoom) || 9;
  const zoomOffset = Number(manifest.offlineZoomOffset) || 0;
  const preferredTileZoom = baseLeafletZoom + zoomOffset;
  return nearestZoom(availableZooms, preferredTileZoom);
}

function nearestZoom(availableZooms, target) {
  let best = availableZooms[0];
  let bestDistance = Math.abs(best - target);
  for (const zoom of availableZooms) {
    const distance = Math.abs(zoom - target);
    if (distance < bestDistance) {
      best = zoom;
      bestDistance = distance;
    }
  }
  return best;
}

function getTileRangesForBounds(bounds, z) {
  const [[south, west], [north, east]] = bounds;
  const minX = lonToTileX(west, z);
  const maxX = lonToTileX(east, z);
  const minY = latToTileY(north, z);
  const maxY = latToTileY(south, z);
  return { minX, maxX, minY, maxY };
}

function loadCatalog() {
  const source = fs.readFileSync(CATALOG_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: CATALOG_PATH });
  const list = sandbox.window?.YanqiSpotMapCatalog?.list;
  if (!Array.isArray(list)) {
    throw new Error('Failed to load YanqiSpotMapCatalog.list');
  }
  const byKey = new Map(list.map((spot) => [spot.key, spot]));
  return byKey;
}

function loadIndex() {
  const raw = fs.readFileSync(INDEX_PATH, 'utf8');
  return JSON.parse(raw);
}

function loadPack(spotKey, packPath) {
  const source = fs.readFileSync(packPath, 'utf8');
  const sandbox = { window: {}, globalThis: {} };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: packPath });
  const registry =
    sandbox.window.__YANQI_SEA_ATLAS_PACKS__
    || sandbox.globalThis.__YANQI_SEA_ATLAS_PACKS__;
  if (!registry || !registry[spotKey]) {
    throw new Error(`Pack ${spotKey} did not register correctly: ${packPath}`);
  }
  return registry[spotKey];
}

async function renderMosaicForSpot(spot, manifest, packRecord, options) {
  const tiles = packRecord.tiles || {};
  const tileKeys = Object.keys(tiles);
  if (!tileKeys.length) {
    throw new Error(`No tiles in pack for ${spot.key}`);
  }

  const availableZooms = [...new Set(tileKeys.map((key) => Number(key.split('/')[0])))]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const tileZoom = chooseTileZoom(spot, manifest, availableZooms, options.zoom);

  const sourceBounds = Array.isArray(spot.mapBounds) && spot.mapBounds.length === 2
    ? spot.mapBounds
    : manifest.bounds;
  if (!Array.isArray(sourceBounds) || sourceBounds.length !== 2) {
    throw new Error(`Missing bounds for ${spot.key}`);
  }

  const firstViewBounds = expandBounds(sourceBounds, options.latExpand, options.lonExpand);
  const ranges = getTileRangesForBounds(firstViewBounds, tileZoom);
  const widthTiles = ranges.maxX - ranges.minX + 1;
  const heightTiles = ranges.maxY - ranges.minY + 1;
  const canvasWidth = widthTiles * TILE_SIZE;
  const canvasHeight = heightTiles * TILE_SIZE;

  const composites = [];
  let presentTiles = 0;
  let missingTiles = 0;

  for (let y = ranges.minY; y <= ranges.maxY; y += 1) {
    for (let x = ranges.minX; x <= ranges.maxX; x += 1) {
      const tileKey = `${tileZoom}/${x}/${y}.webp`;
      const tileBase64 = tiles[tileKey];
      if (!tileBase64) {
        missingTiles += 1;
        continue;
      }
      presentTiles += 1;
      composites.push({
        input: Buffer.from(tileBase64, 'base64'),
        left: (x - ranges.minX) * TILE_SIZE,
        top: (y - ranges.minY) * TILE_SIZE,
      });
    }
  }

  const base = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 4, g: 22, b: 34, alpha: 1 },
    },
  });

  const rendered = await base
    .composite(composites)
    .png()
    .toBuffer();

  const outFile = path.join(options.outDir, `mosaic-${spot.key}.png`);
  if (options.overwrite || !fs.existsSync(outFile)) {
    await sharp(rendered)
      .resize({
        width: options.width,
        height: options.height,
        fit: 'inside',
        withoutEnlargement: false,
      })
      .png()
      .toFile(outFile);
  }

  return {
    key: spot.key,
    name: manifest.name || spot.name || spot.key,
    tileZoom,
    range: ranges,
    widthTiles,
    heightTiles,
    presentTiles,
    missingTiles,
    sourceBounds,
    firstViewBounds,
    outputFile: outFile,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const catalogByKey = loadCatalog();
  const index = loadIndex();
  const spotEntries = Array.isArray(index.spots) ? index.spots : [];
  const indexByKey = new Map(spotEntries.map((item) => [item.key, item]));

  let targetKeys;
  if (options.all) {
    targetKeys = spotEntries.map((item) => item.key);
  } else if (options.spots.length) {
    targetKeys = [...new Set(options.spots)];
  } else {
    throw new Error('No spot selected. Use --spot/--spots or --all.');
  }

  fs.mkdirSync(options.outDir, { recursive: true });

  const report = {
    generatedAt: new Date().toISOString(),
    outDir: options.outDir,
    width: options.width,
    height: options.height,
    latExpand: options.latExpand,
    lonExpand: options.lonExpand,
    zoom: options.zoom,
    spots: [],
  };

  for (const key of targetKeys) {
    const indexManifest = indexByKey.get(key);
    if (!indexManifest) {
      throw new Error(`Spot "${key}" not found in packs index`);
    }
    const spot = catalogByKey.get(key) || { key, name: indexManifest.name, mapBounds: indexManifest.bounds };
    const packPath = path.join(SITE_ROOT, indexManifest.offlineTilePack.replace(/\//g, path.sep));
    if (!fs.existsSync(packPath)) {
      throw new Error(`Pack file not found for ${key}: ${packPath}`);
    }
    const packRecord = loadPack(key, packPath);
    const item = await renderMosaicForSpot(spot, indexManifest, packRecord, options);
    report.spots.push(item);
    process.stdout.write(
      `mosaic ${item.key}: zoom=${item.tileZoom}, tiles=${item.presentTiles}/${item.presentTiles + item.missingTiles}, output=${item.outputFile}\n`
    );
  }

  const reportPath = path.join(options.outDir, 'mosaic-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  process.stdout.write(`report written: ${reportPath}\n`);
}

main().catch((error) => {
  process.stderr.write(`sea-atlas-first-view-mosaic failed: ${error.message}\n`);
  process.exit(1);
});
