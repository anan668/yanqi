const path = require('path');
const { chromium } = require('@playwright/test');

async function readStoryState(page, label) {
    const state = await page.evaluate(() => {
        const section = document.getElementById('why-yanqi');
        const cards = Array.from(document.querySelectorAll('#why-yanqi .story-card.story-reveal'));
        const intro = document.querySelector('#why-yanqi .story-intro.story-reveal');
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

        const summarize = (element) => {
            if (!element) {
                return null;
            }

            const rect = element.getBoundingClientRect();
            return {
                top: Math.round(rect.top),
                bottom: Math.round(rect.bottom),
                height: Math.round(rect.height),
                isVisible: element.classList.contains('is-visible')
            };
        };

        return {
            scrollY: Math.round(window.scrollY || window.pageYOffset || 0),
            viewportHeight,
            section: summarize(section),
            intro: summarize(intro),
            cards: cards.map((card, index) => ({
                index,
                ...summarize(card)
            }))
        };
    });

    console.log(JSON.stringify({ label, ...state }, null, 2));
}

(async () => {
    const browser = await chromium.launch({
        headless: true,
        executablePath: path.resolve('playwright-browser/chrome-win64/chrome.exe')
    });

    const page = await browser.newPage({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1
    });

    const fileUrl = `file:///${path.resolve('home.html').replace(/\\/g, '/')}`;
    await page.goto(fileUrl, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    await readStoryState(page, 'initial');

    for (const y of [300, 700, 1100, 1500, 1900, 2300, 2700, 3100]) {
        await page.evaluate((nextY) => window.scrollTo(0, nextY), y);
        await page.waitForTimeout(280);
        await readStoryState(page, `scroll-${y}`);
    }

    await browser.close();
})().catch((error) => {
    console.error(error);
    process.exit(1);
});
