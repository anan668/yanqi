const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false
  });

  const page = await browser.newPage();
  const tripUrl = pathToFileURL(path.resolve(__dirname, '..', '..', 'site', 'trip.html')).toString();
  await page.goto(tripUrl);
  await page.waitForTimeout(5000);
  await browser.close();
})();
