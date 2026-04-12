const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const HERO_PLACEHOLDER = 'assets/images/diving-spot.jpg';
const LEAFLET_RESOURCES = [
  'assets/vendor/leaflet/leaflet.css',
  'assets/vendor/leaflet/leaflet.js'
];

async function runSmoke() {
  const detailFileUrl = pathToFileURL(path.resolve(__dirname, '..', 'detail.html'));
  const targetUrl = `${detailFileUrl.toString()}?id=1`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const requested = new Set();

  await page.addInitScript(() => {
    window.__perfSmokeMetrics = {
      getBoundingClientRect: 0,
      querySelectorAll: 0
    };

    const originalGbr = Element.prototype.getBoundingClientRect;
    Element.prototype.getBoundingClientRect = function (...args) {
      window.__perfSmokeMetrics.getBoundingClientRect += 1;
      return originalGbr.apply(this, args);
    };

    const originalDocumentQsa = Document.prototype.querySelectorAll;
    Document.prototype.querySelectorAll = function (...args) {
      window.__perfSmokeMetrics.querySelectorAll += 1;
      return originalDocumentQsa.apply(this, args);
    };

    const originalElementQsa = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function (...args) {
      window.__perfSmokeMetrics.querySelectorAll += 1;
      return originalElementQsa.apply(this, args);
    };
  });

  page.on('request', (request) => requested.add(request.url()));

  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }));
  await page.waitForTimeout(1200);
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(600);

  const spotReviews = page.locator('#spotReviews');
  if (await spotReviews.count()) {
    await spotReviews.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
  }

  const filterButtons = await page.$$('.review-filter');
  if (filterButtons.length > 1) {
    await filterButtons[1].click();
    await page.waitForTimeout(500);
    await filterButtons[0].click();
    await page.waitForTimeout(400);
  }

  const firstRelatedAction = page.locator('.related-feature-action').first();
  if (await firstRelatedAction.count()) {
    await firstRelatedAction.click();
    await page.waitForTimeout(1200);
  }

  const metrics = await page.evaluate(() => window.__perfSmokeMetrics || {});
  const heroRequested = Array.from(requested).some((url) => url.includes(HERO_PLACEHOLDER));
  const leafletHits = LEAFLET_RESOURCES.filter((resource) =>
    Array.from(requested).some((url) => url.includes(resource))
  );

  const summary = {
    url: targetUrl,
    runtimeRequests: requested.size,
    heroPlaceholderRequested: heroRequested,
    leafletResourcesRequested: leafletHits,
    runtimeMetrics: metrics
  };

  console.log('Detail perf smoke summary:\n', JSON.stringify(summary, null, 2));
  await browser.close();
}

runSmoke().catch((error) => {
  console.error('detail-perf-smoke failed', error);
  process.exit(1);
});
