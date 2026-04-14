#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const SITE_ROOT = path.join(ROOT, 'site');
const PACKS_ROOT = path.join(SITE_ROOT, 'assets', 'maps', 'packs');
const INDEX_PATH = path.join(PACKS_ROOT, 'index.json');
const DEFAULT_OUT_DIR = path.join(__dirname, 'out', 'sea-atlas-build-reports');

function parseArgs(argv) {
  const options = {
    run: false,
    python: process.env.SEA_ATLAS_PYTHON || 'python',
    generator: path.join('tools', 'maps', 'generate-sea-atlas-tiles.py'),
    generatorArgs: [],
    outDir: DEFAULT_OUT_DIR,
    outFile: '',
    label: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--run') {
      options.run = true;
      continue;
    }
    if (arg === '--python' && argv[i + 1]) {
      options.python = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--python=')) {
      options.python = arg.slice('--python='.length);
      continue;
    }
    if (arg === '--generator' && argv[i + 1]) {
      options.generator = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--generator=')) {
      options.generator = arg.slice('--generator='.length);
      continue;
    }
    if (arg === '--label' && argv[i + 1]) {
      options.label = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--label=')) {
      options.label = arg.slice('--label='.length);
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
    if (arg === '--out-file' && argv[i + 1]) {
      options.outFile = path.resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith('--out-file=')) {
      options.outFile = path.resolve(arg.slice('--out-file='.length));
      continue;
    }
    if (arg === '--') {
      options.generatorArgs = argv.slice(i + 1);
      break;
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
      'Usage: node tools/qa/sea-atlas-build-report.cjs [options] [-- <generator args>]',
      '',
      'Options:',
      '  --run                       Run generator and include timing summary',
      '  --python <cmd>              Python executable (default: python)',
      '  --generator <path>          Generator script path (default: tools/maps/generate-sea-atlas-tiles.py)',
      '  --label <text>              Report label',
      '  --out-dir <path>            Output directory for report JSON',
      '  --out-file <path>           Explicit output JSON path',
      '',
      'Examples:',
      '  node tools/qa/sea-atlas-build-report.cjs',
      '  node tools/qa/sea-atlas-build-report.cjs --run -- --spot mabul',
      '  node tools/qa/sea-atlas-build-report.cjs --run --python "C:/Python39/python.exe" -- --all --workers auto',
    ].join('\n')
  );
  process.exit(code);
}

function snapshotPacks() {
  const files = new Map();
  if (!fs.existsSync(PACKS_ROOT)) {
    return files;
  }
  const entries = fs.readdirSync(PACKS_ROOT, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith('.pack.js') && entry.name !== 'index.json') {
      continue;
    }
    const absolute = path.join(PACKS_ROOT, entry.name);
    const stat = fs.statSync(absolute);
    files.set(entry.name, {
      size: stat.size,
      mtimeMs: stat.mtimeMs,
    });
  }
  return files;
}

function diffSnapshots(before, after) {
  const added = [];
  const removed = [];
  const changed = [];
  for (const [name, meta] of after.entries()) {
    if (!before.has(name)) {
      added.push({ name, ...meta });
      continue;
    }
    const prev = before.get(name);
    if (prev.size !== meta.size || prev.mtimeMs !== meta.mtimeMs) {
      changed.push({
        name,
        sizeBefore: prev.size,
        sizeAfter: meta.size,
        deltaBytes: meta.size - prev.size,
      });
    }
  }
  for (const [name, meta] of before.entries()) {
    if (!after.has(name)) {
      removed.push({ name, ...meta });
    }
  }
  return { added, removed, changed };
}

function loadIndexSummary() {
  if (!fs.existsSync(INDEX_PATH)) {
    return {
      exists: false,
      spotCount: 0,
      totalTiles: 0,
      totalPackBytesFromIndex: 0,
      spots: [],
      topTileSpots: [],
      topSizeSpots: [],
    };
  }

  const index = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  const spots = Array.isArray(index.spots) ? index.spots : [];
  const normalizedSpots = spots.map((spot) => ({
    key: spot.key,
    tileCount: Number(spot.tileCount) || 0,
    packSizeBytes: Number(spot.packSizeBytes) || 0,
    offlineMinZoom: Number(spot.offlineMinZoom),
    offlineMaxZoom: Number(spot.offlineMaxZoom),
  }));
  const totalTiles = normalizedSpots.reduce((sum, item) => sum + item.tileCount, 0);
  const totalPackBytesFromIndex = normalizedSpots.reduce((sum, item) => sum + item.packSizeBytes, 0);
  const topTileSpots = [...normalizedSpots]
    .sort((a, b) => b.tileCount - a.tileCount)
    .slice(0, 5);
  const topSizeSpots = [...normalizedSpots]
    .sort((a, b) => b.packSizeBytes - a.packSizeBytes)
    .slice(0, 5);
  return {
    exists: true,
    spotCount: normalizedSpots.length,
    totalTiles,
    totalPackBytesFromIndex,
    version: index.version || '',
    packFormat: index.packFormat || '',
    tileSize: Number(index.tileSize) || 0,
    zoomOffset: Number(index.zoomOffset) || 0,
    spots: normalizedSpots,
    topTileSpots,
    topSizeSpots,
  };
}

function bytesToMiB(bytes) {
  return Number((bytes / (1024 * 1024)).toFixed(2));
}

function runGenerator(python, generator, args) {
  const resolvedGenerator = path.isAbsolute(generator) ? generator : path.join(ROOT, generator);
  const commandArgs = [resolvedGenerator, ...args];
  const startedAt = Date.now();
  const result = spawnSync(python, commandArgs, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  });
  const endedAt = Date.now();

  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    startedAt,
    endedAt,
    durationMs: endedAt - startedAt,
    command: [python, ...commandArgs],
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function summarizeStdout(stdoutText) {
  const lines = stdoutText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const generatedLines = lines.filter((line) => /^generated\s+/i.test(line));
  return {
    lineCount: lines.length,
    generatedLineCount: generatedLines.length,
    sample: lines.slice(-10),
  };
}

function buildOutputFilePath(options) {
  if (options.outFile) {
    return options.outFile;
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const tag = options.label ? options.label.replace(/[^a-zA-Z0-9_-]/g, '_') : 'build';
  return path.join(options.outDir, `sea-atlas-${tag}-${timestamp}.json`);
}

function printReport(report) {
  process.stdout.write('\n== Sea Atlas Build Report ==\n');
  process.stdout.write(`label: ${report.label || '(none)'}\n`);
  process.stdout.write(`runGenerator: ${report.runGenerator}\n`);
  if (report.generatorRun) {
    process.stdout.write(`command: ${report.generatorRun.command.join(' ')}\n`);
    process.stdout.write(`status: ${report.generatorRun.status}\n`);
    process.stdout.write(`durationMs: ${report.generatorRun.durationMs}\n`);
    process.stdout.write(`generatedLines: ${report.generatorRun.stdoutSummary.generatedLineCount}\n`);
  }
  process.stdout.write(`spotCount: ${report.indexSummary.spotCount}\n`);
  process.stdout.write(`totalTiles: ${report.indexSummary.totalTiles}\n`);
  process.stdout.write(`totalPackMiB: ${bytesToMiB(report.indexSummary.totalPackBytesFromIndex)}\n`);
  process.stdout.write(
    `packChanges: added=${report.packDiff.added.length}, changed=${report.packDiff.changed.length}, removed=${report.packDiff.removed.length}\n`
  );
  if (report.packDiff.changed.length) {
    const names = report.packDiff.changed.map((item) => item.name).join(', ');
    process.stdout.write(`changedPacks: ${names}\n`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.outDir, { recursive: true });

  const before = snapshotPacks();
  let generatorRun = null;
  if (options.run) {
    generatorRun = runGenerator(options.python, options.generator, options.generatorArgs);
    process.stdout.write(generatorRun.stdout || '');
    process.stderr.write(generatorRun.stderr || '');
    if (!generatorRun.ok) {
      process.stderr.write(`Generator failed with status ${generatorRun.status}\n`);
      process.exit(generatorRun.status || 1);
    }
  }
  const after = snapshotPacks();

  const report = {
    generatedAt: new Date().toISOString(),
    label: options.label,
    runGenerator: options.run,
    generatorRun: generatorRun
      ? {
          command: generatorRun.command,
          status: generatorRun.status,
          signal: generatorRun.signal,
          durationMs: generatorRun.durationMs,
          stdoutSummary: summarizeStdout(generatorRun.stdout),
          stderrTail: generatorRun.stderr.split(/\r?\n/).slice(-20),
        }
      : null,
    packDiff: diffSnapshots(before, after),
    indexSummary: loadIndexSummary(),
  };

  const outFile = buildOutputFilePath(options);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), 'utf8');
  printReport(report);
  process.stdout.write(`report written: ${outFile}\n`);
}

main();
