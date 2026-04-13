const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const sharp = require('sharp');

const PROJECT_ROOT = path.resolve(__dirname, '..', '..');
const IMAGE_ROOT = path.resolve(PROJECT_ROOT, 'site', 'assets', 'images');
const JPG_PATTERN = /\.jpe?g$/i;
const MIN_FILE_SIZE_BYTES = 1 * 1024 * 1024;
const JPEG_QUALITY = 84;
const JPEG_QUALITY_STEPS = Object.freeze([84, 80, 76, 72, 68, 64, 60, 56]);
const gitHeadSizeCache = new Map();

async function walkDirectory(dirPath, files = []) {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walkDirectory(entryPath, files);
      continue;
    }

    if (entry.isFile() && JPG_PATTERN.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

function resolveRepoRelativePath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).replace(/\\/g, '/');
}

function readGitHeadFileSize(filePath) {
  const relativePath = resolveRepoRelativePath(filePath);
  const candidatePaths = relativePath.startsWith('site/')
    ? [relativePath, relativePath.replace(/^site\//, '')]
    : [relativePath, `site/${relativePath}`];
  const cacheKey = candidatePaths.join('|');

  if (gitHeadSizeCache.has(cacheKey)) {
    return gitHeadSizeCache.get(cacheKey);
  }

  let size = null;
  for (const candidatePath of candidatePaths) {
    try {
      size = Number(execSync(`git cat-file -s HEAD:${candidatePath}`, {
        cwd: PROJECT_ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore']
      }).trim());
      if (Number.isFinite(size)) {
        break;
      }
    } catch (error) {
      size = null;
    }
  }

  gitHeadSizeCache.set(cacheKey, size);
  return size;
}

async function buildOptimizedVariant(inputPath, quality) {
  const { data, info } = await sharp(inputPath, { failOn: 'warning' })
    .jpeg({
      quality,
      mozjpeg: true,
      progressive: true,
      chromaSubsampling: '4:2:0',
      trellisQuantisation: true,
      overshootDeringing: true,
      optimizeScans: true,
      quantisationTable: 3
    })
    .toBuffer({ resolveWithObject: true });

  return {
    buffer: data,
    size: data.length,
    width: info.width,
    height: info.height,
    quality
  };
}

async function optimizeSingleImage(filePath) {
  const beforeStat = await fs.promises.stat(filePath);
  const baselineSize = readGitHeadFileSize(filePath) || beforeStat.size;
  const targetMaxSize = Math.floor(baselineSize / 2);
  const shouldProcess = beforeStat.size > MIN_FILE_SIZE_BYTES || baselineSize > MIN_FILE_SIZE_BYTES;

  if (!shouldProcess) {
    return null;
  }

  if (beforeStat.size <= targetMaxSize) {
    return {
      filePath,
      baselineSize,
      beforeSize: beforeStat.size,
      afterSize: beforeStat.size,
      savedBytes: 0,
      skipped: true
    };
  }

  const beforeMeta = await sharp(filePath).metadata();
  const tempPath = `${filePath}.yanqi-optimize.tmp`;
  const backupPath = `${filePath}.yanqi-optimize.backup`;

  await fs.promises.rm(tempPath, { force: true });
  await fs.promises.rm(backupPath, { force: true });

  let bestVariant = null;
  for (const quality of JPEG_QUALITY_STEPS) {
    const variant = await buildOptimizedVariant(filePath, quality);
    if (beforeMeta.width !== variant.width || beforeMeta.height !== variant.height) {
      throw new Error(`Image dimensions changed unexpectedly for ${filePath}`);
    }

    if (!bestVariant || variant.size < bestVariant.size) {
      bestVariant = variant;
    }

    if (variant.size <= targetMaxSize) {
      break;
    }
  }

  if (!bestVariant || bestVariant.size >= beforeStat.size) {
    return {
      filePath,
      baselineSize,
      beforeSize: beforeStat.size,
      afterSize: beforeStat.size,
      savedBytes: 0,
      skipped: true
    };
  }

  await fs.promises.writeFile(tempPath, bestVariant.buffer);

  try {
    await fs.promises.rename(filePath, backupPath);
    await fs.promises.rename(tempPath, filePath);
    await fs.promises.rm(backupPath, { force: true });
  } catch (error) {
    if (!(await fs.promises.stat(filePath).then(() => true).catch(() => false)) && (await fs.promises.stat(backupPath).then(() => true).catch(() => false))) {
      await fs.promises.rename(backupPath, filePath);
    }
    await fs.promises.rm(tempPath, { force: true });
    throw error;
  }

  return {
    filePath,
    baselineSize,
    beforeSize: beforeStat.size,
    afterSize: bestVariant.size,
    savedBytes: beforeStat.size - bestVariant.size,
    skipped: false,
    quality: bestVariant.quality
  };
}

function formatMb(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
}

async function run() {
  const files = await walkDirectory(IMAGE_ROOT);
  const candidates = [];

  for (const filePath of files) {
    const stats = await fs.promises.stat(filePath);
    const baselineSize = readGitHeadFileSize(filePath) || stats.size;
    if (stats.size > MIN_FILE_SIZE_BYTES || baselineSize > MIN_FILE_SIZE_BYTES) {
      candidates.push(filePath);
    }
  }

  const results = [];
  for (const filePath of candidates) {
    const result = await optimizeSingleImage(filePath);
    if (result) {
      results.push(result);
      const action = result.skipped ? 'skip' : 'done';
      const qualityLabel = result.quality ? ` q${result.quality}` : '';
      console.log(`[${action}] ${path.relative(PROJECT_ROOT, filePath)} ${formatMb(result.beforeSize)} -> ${formatMb(result.afterSize)}${qualityLabel}`);
    }
  }

  const optimized = results.filter((item) => !item.skipped);
  const totalBefore = results.reduce((sum, item) => sum + item.beforeSize, 0);
  const totalAfter = results.reduce((sum, item) => sum + item.afterSize, 0);
  const totalSaved = results.reduce((sum, item) => sum + item.savedBytes, 0);
  const baselineQualified = results.filter((item) => item.baselineSize > MIN_FILE_SIZE_BYTES);
  const hitHalfTarget = baselineQualified.filter((item) => item.afterSize <= Math.floor(item.baselineSize / 2)).length;

  console.log(
    JSON.stringify(
      {
        candidates: candidates.length,
        changed: optimized.length,
        totalBeforeBytes: totalBefore,
        totalAfterBytes: totalAfter,
        totalSavedBytes: totalSaved,
        totalSavedMb: Number((totalSaved / (1024 * 1024)).toFixed(2)),
        halfTargetQualified: baselineQualified.length,
        halfTargetReached: hitHalfTarget
      },
      null,
      2
    )
  );
}

run().catch((error) => {
  console.error('optimize-images failed');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
