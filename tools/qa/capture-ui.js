const { chromium } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

(async () => {
    try {
        console.log('Starting browser...');
        const browser = await chromium.launch();
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        
        const pages = ['index', 'home', 'detail', 'trip'];
        const baseUrl = 'http://127.0.0.1:8080/site';
        
        const outDir = path.resolve(__dirname, '../../测试/screenshots');
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
        }
        
        for (const pageName of pages) {
            const page = await context.newPage();
            const url = `${baseUrl}/${pageName}.html`;
            console.log(`Navigating to ${url}`);
            
            // Wait for DOM content to load and network to be mostly idle
            await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
            
            // Explicitly wait for fonts to load
            await page.evaluate(() => document.fonts.ready);
            
            // Scroll down and up to trigger any lazy-loaded elements or scroll animations
            await page.evaluate(async () => {
                const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
                for (let i = 0; i < document.body.scrollHeight; i += 500) {
                    window.scrollTo(0, i);
                    await delay(100);
                }
                window.scrollTo(0, 0);
            });
            
            // Wait significantly longer for any JS-driven components to mount and fetch data
            await page.waitForTimeout(8000); 
            
            const outPath = path.join(outDir, `${pageName}-full.png`);
            await page.screenshot({ path: outPath, fullPage: true });
            console.log(`Screenshot saved to ${outPath}`);
            await page.close();
        }
        
        await browser.close();
        console.log('All screenshots captured successfully.');
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
})();
