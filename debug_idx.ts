import { chromium } from 'playwright';

(async () => {
    try {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        const erpId = process.env.ERP_ID || '';
        const erpPassword = process.env.ERP_PASSWORD || '';
        if (!erpId || !erpPassword) {
            throw new Error('Missing ERP credentials. Set ERP_ID and ERP_PASSWORD env vars.');
        }

        await page.goto('http://sook0517.cafe24.com/index/member');
        await page.fill('input[placeholder="아이디"]', erpId);
        await page.fill('input[placeholder="비밀번호"]', erpPassword);
        await page.click('button[type="submit"]');

        await page.waitForTimeout(2000);
        if (!page.url().includes('calender')) {
            await page.goto('http://sook0517.cafe24.com/index/calender');
        }

        await page.waitForSelector('.fc-event', { timeout: 10000 });

        // Concise Output
        const html = await page.locator('.fc-event').first().evaluate((el: any) => el.outerHTML);
        console.log('---START HTML---');
        console.log(html);
        console.log('---END HTML---');

        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();

