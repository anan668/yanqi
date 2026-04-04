const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false
  });

  const page = await browser.newPage();
  await page.goto('file:///C:/Users/%E6%A1%89%E6%A1%89/Desktop/%E7%9B%90%E6%86%A9/trip.html');
  await page.waitForTimeout(5000);
  await browser.close();
})();
