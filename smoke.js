/* ============================================
   本地烟雾测试脚本 - smoke.js
   ============================================
   用途：
   1. 通过 Playwright 手动打开本地 `trip.html`。
   2. 快速确认页面至少能启动、渲染并停留几秒供人工观察。
   3. 这是轻量烟雾测试，不负责断言复杂交互。
*/
const { chromium } = require('@playwright/test');

(async () => {
  // 这里固定走本机 Chrome，方便直接看到真实窗口里的页面表现。
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    headless: false
  });

  const page = await browser.newPage();
  // 直接打开本地文件协议下的 trip 页面，适合开发期做快速可视检查。
  await page.goto('file:///C:/Users/%E6%A1%89%E6%A1%89/Desktop/%E7%9B%90%E6%86%A9/trip.html');
  // 停 5 秒给人工观察首屏、动画和控制台是否有明显异常。
  await page.waitForTimeout(5000);
  await browser.close();
})();
