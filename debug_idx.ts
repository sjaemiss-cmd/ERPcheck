import { chromium } from 'playwright';

(async () => {
    try {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        await page.goto('http://sook0517.cafe24.com/index/member');
        await page.fill('input[placeholder="아이디"]', 'dobong');
        await page.fill('input[placeholder="비밀번호"]', '1010');
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

