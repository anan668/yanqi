const { chromium } = require('@playwright/test');
const path = require('path');

(async () => {
    try {
        console.log('Starting browser...');
        const browser = await chromium.launch();
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        
        const filePath = 'file:///' + path.resolve(__dirname, '../../site/home.html').replace(/\\/g, '/');
        console.log('Navigating to ' + filePath);
        
        await page.goto(filePath, { waitUntil: 'networkidle' });
        
        // Wait a bit for entrance animations to settle
        await page.waitForTimeout(3000); 
        
        // Take screenshot of the bamboo scroll area
        const outPath = path.resolve(__dirname, '../../.tmp/home-arrow-preview.png');
        await page.screenshot({ 
            path: outPath,
            clip: { x: 0, y: 500, width: 1440, height: 600 } 
        });
        
        await browser.close();
        console.log('Screenshot saved to .tmp/home-arrow-preview.png');
    } catch (e) {
        console.error('Error:', e);
        process.exit(1);
    }
})();
