const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

const VIEWPORTS = [
  {
    label: '1440',
    width: 1440,
    height: 1200
  },
  {
    label: '1920',
    width: 1920,
    height: 1280
  },
  {
    label: '2560',
    width: 2560,
    height: 1440
  }
];

const PAGE_SPECS = [
  {
    name: 'index',
    file: 'index.html',
    checks: [
      '#loginStageShell',
      '#authForm',
      '#demoVoyageButton',
      '#loginStageHud'
    ]
  },
  {
    name: 'home',
    file: 'home.html',
    checks: [
      '#hero-home',
      '#featured-destinations',
      '#dive-match',
      '#why-yanqi',
      '#homeFooter'
    ]
  },
  {
    name: 'trip',
    file: 'trip.html',
    checks: [
      '#trip-top',
      '#plannerDeskControl',
      '#plannerSummary',
      '#trip-prep',
      '#tripFooter'
    ]
  },
  {
    name: 'contact',
    file: 'contact.html',
    checks: [
      '#contactMethodsSection',
      '#contactMethods',
      '#contactFormSection',
      '#contactMemorySection'
    ]
  }
];

async function runPageSmoke(browser, spec, viewport) {
  const pageUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'site', spec.file)).toString();
  const page = await browser.newPage({
    viewport: {
      width: viewport.width,
      height: viewport.height
    }
  });

  const requests = [];
  const consoleErrors = [];
  const pageErrors = [];

  page.on('request', (request) => requests.push(request.url()));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => pageErrors.push(error.message));

  await page.goto(pageUrl, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  const missingSelectors = [];
  for (const selector of spec.checks) {
    const locator = page.locator(selector);
    if (!(await locator.count())) {
      missingSelectors.push(selector);
      continue;
    }

    await locator.first().evaluate((node) => {
      node.scrollIntoView({
        block: 'center',
        inline: 'nearest',
        behavior: 'instant'
      });
    });
    await page.waitForTimeout(220);
  }

  const summary = {
    name: spec.name,
    viewport: viewport.label,
    url: pageUrl,
    requestCount: requests.length,
    missingSelectors,
    consoleErrors,
    pageErrors
  };

  await page.close();
  return summary;
}

async function runSmoke() {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const viewport of VIEWPORTS) {
    for (const spec of PAGE_SPECS) {
      results.push(await runPageSmoke(browser, spec, viewport));
    }
  }

  await browser.close();

  console.log('Pages perf smoke summary:\n' + JSON.stringify(results, null, 2));

  const failures = results
    .flatMap((result) => {
      const messages = [];
      if (result.missingSelectors.length) {
        messages.push(`${result.name}@${result.viewport}: missing selectors ${result.missingSelectors.join(', ')}`);
      }
      if (result.consoleErrors.length) {
        messages.push(`${result.name}@${result.viewport}: console errors ${JSON.stringify(result.consoleErrors)}`);
      }
      if (result.pageErrors.length) {
        messages.push(`${result.name}@${result.viewport}: page errors ${JSON.stringify(result.pageErrors)}`);
      }
      return messages;
    });

  if (failures.length) {
    throw new Error(failures.join('\n'));
  }
}

runSmoke().catch((error) => {
  console.error('pages-perf-smoke failed');
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
