
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

        // Inspect jQuery Data
        const debugInfo = await page.evaluate(() => {
            const el = document.querySelector('.fc-event');
            // @ts-ignore
            const $ = window.$;
            if (!$) return { error: 'jQuery not found' };

            const $el = $(el);
            return {
                data: $el.data(),
                attrHref: $el.attr('href'),
                attrOnclick: $el.attr('onclick'),
                // Check if FullCalendar is attached
                fcEvent: $el.data('fcSeg')?.event || 'No fcSeg',
                rawEvent: ($el[0] as any).fcSeg?.event
            };
        });

        console.log('---START DEBUG---');
        console.log(JSON.stringify(debugInfo, null, 2));
        console.log('---END DEBUG---');

        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
