const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const DETAIL_ID = 1;
const INITIAL_WAIT_MS = 1800;
const SECTION_WAIT_MS = 1600;

function summarizeRequests(requests, pattern) {
  return requests.filter((url) => pattern.test(url));
}

function formatFailure(message, details = null) {
  return details ? `${message}\n${JSON.stringify(details, null, 2)}` : message;
}

async function waitForTruthy(producer, timeoutMs = 4000, stepMs = 120) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const value = await producer();
    if (value) {
      return value;
    }

    await new Promise((resolve) => setTimeout(resolve, stepMs));
  }

  return null;
}

async function runSmoke() {
  const detailFileUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'site', 'detail.html'));
  const targetUrl = `${detailFileUrl.toString()}?id=${DETAIL_ID}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: {
      width: 1440,
      height: 1200
    }
  });

  const requests = [];
  const consoleErrors = [];
  const pageErrors = [];
  const failures = [];

  page.on('request', (request) => requests.push(request.url()));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(targetUrl, { waitUntil: 'load' });
  await page.waitForTimeout(INITIAL_WAIT_MS);

  const primaryReady = await waitForTruthy(async () => {
    const title = await page.locator('#spotName').textContent();
    const packageCount = await page.locator('.package-card').count();
    return title && title.replace(/\s+/g, '').length > 0 && packageCount > 0;
  });

  if (!primaryReady) {
    failures.push('详情页首批内容没有在预期时间内完成渲染。');
  }

  const initialLeafletRequests = summarizeRequests(requests, /assets\/vendor\/leaflet\/leaflet\.js/i);
  const initialPackRequests = summarizeRequests(requests, /assets\/maps\/packs\/.+\.pack\.js/i);
  const initialOtherDetailDocs = summarizeRequests(
    requests,
    /detail\.html\?id=(?!1\b)\d+/i
  );

  if (initialLeafletRequests.length) {
    failures.push(formatFailure('详情页首屏仍然提前请求了 leaflet.js。', initialLeafletRequests));
  }

  if (initialPackRequests.length) {
    failures.push(formatFailure('详情页首屏仍然提前请求了离线海图 pack。', initialPackRequests));
  }

  if (initialOtherDetailDocs.length) {
    failures.push(formatFailure('详情页首屏仍然提前请求了其它 detail.html 整页文档。', initialOtherDetailDocs));
  }

  await page.locator('#spotReviews').scrollIntoViewIfNeeded();
  await page.waitForTimeout(SECTION_WAIT_MS);

  const filterButtons = page.locator('.review-filter');
  if (await filterButtons.count() > 1) {
    await filterButtons.nth(1).click();
    await page.waitForTimeout(320);
    await filterButtons.first().click();
    await page.waitForTimeout(240);
  }

  await page.locator('#relatedSpots').scrollIntoViewIfNeeded();
  await page.waitForTimeout(SECTION_WAIT_MS);

  const revealOtherDetailDocs = summarizeRequests(
    requests,
    /detail\.html\?id=(?!1\b)\d+/i
  );
  if (revealOtherDetailDocs.length) {
    failures.push(formatFailure('相关推荐出现在视口后仍然请求了其它 detail.html 整页文档。', revealOtherDetailDocs));
  }

  const relatedCards = page.locator('.related-feature-card, .related-neighbor-card');
  if (await relatedCards.count() > 1) {
    await relatedCards.nth(1).hover();
    await page.waitForTimeout(700);
  }

  await page.locator('#spotMapSection').scrollIntoViewIfNeeded();
  await page.waitForTimeout(SECTION_WAIT_MS);

  const mapLeafletRequests = summarizeRequests(requests, /assets\/vendor\/leaflet\/leaflet\.js/i);
  const mapPackRequests = summarizeRequests(requests, /assets\/maps\/packs\/.+\.pack\.js/i);

  if (!mapLeafletRequests.length) {
    failures.push('滚动到海图区后没有请求 leaflet.js。');
  }

  if (!mapPackRequests.length) {
    failures.push('滚动到海图区后没有请求离线海图 pack。');
  }

  const fullscreenButton = page.locator('[data-sea-atlas-open-fullscreen]').first();
  if (await fullscreenButton.count()) {
    await fullscreenButton.click();
    await page.waitForTimeout(800);
  }

  const state = await page.evaluate(() => ({
    title: document.title,
    spotName: document.getElementById('spotName')?.textContent?.replace(/\s+/g, '') || '',
    packageCards: document.querySelectorAll('.package-card').length,
    reviewCards: document.querySelectorAll('.review-card').length,
    relatedCards: document.querySelectorAll('.related-feature-card, .related-neighbor-card').length,
    hasInlineLeaflet: Boolean(document.querySelector('#mapContainer .leaflet-container')),
    fullscreenOpen: document.querySelector('[data-sea-atlas-fullscreen]')?.classList.contains('is-open') || false,
    hasFullscreenLeaflet: Boolean(document.querySelector('[data-sea-atlas-fullscreen] .leaflet-container'))
  }));

  if (!state.hasInlineLeaflet) {
    failures.push('海图区已经触发，但还没有看到 Leaflet 容器挂载到内联海图。');
  }

  if (!state.fullscreenOpen || !state.hasFullscreenLeaflet) {
    failures.push(formatFailure('全屏海图没有正常打开或复用地图。', state));
  }

  if (consoleErrors.length) {
    failures.push(formatFailure('浏览器控制台出现 error 日志。', consoleErrors));
  }

  if (pageErrors.length) {
    failures.push(formatFailure('页面抛出了未捕获脚本错误。', pageErrors));
  }

  const summary = {
    url: targetUrl,
    requestCount: requests.length,
    detailSpotDataScripts: summarizeRequests(requests, /js\/detail-spot-data\/.+\.js/i),
    leafletRequests: mapLeafletRequests,
    packRequests: mapPackRequests,
    state
  };

  console.log('Detail perf smoke summary:\n' + JSON.stringify(summary, null, 2));

  await browser.close();

  if (failures.length) {
    throw new Error(failures.join('\n\n'));
  }
}

runSmoke().catch((error) => {
  console.error('detail-perf-smoke failed');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
