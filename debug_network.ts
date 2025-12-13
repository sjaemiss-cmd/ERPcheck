
import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    console.log('1. Logging in...');
    await page.goto('http://sook0517.cafe24.com/index/member');

    // Login
    await page.fill('input[placeholder="아이디"]', 'dobong');
    await page.fill('input[placeholder="비밀번호"]', '1010');
    await page.click('button[type="submit"]'); // Login button

    console.log('2. Waiting for Calendar...');
    // Ensure we are on the calendar page
    await page.waitForTimeout(2000);
    if (!page.url().includes('calender')) {
        await page.goto('http://sook0517.cafe24.com/index/calender');
    }

    await page.waitForSelector('.fc-event', { timeout: 10000 });
    console.log('3. Calendar loaded. Setting up Network Sniffer...');

    // Sniffer
    page.on('request', request => {
        if (request.url().includes('dataFunction') || request.url().includes('ajax') || request.method() === 'POST') {
            console.log(`\n[SNIFFER] URL: ${request.url()}`);
            console.log(`[SNIFFER] Method: ${request.method()}`);
            console.log(`[SNIFFER] PostData: ${request.postData()}`);
        }
    });

    console.log('4. Clicking an event...');
    const event = page.locator('.fc-event').first();
    await event.click({ force: true });

    console.log('5. Waiting for Modal...');
    try {
        await page.waitForSelector('#CalenderModalEdit', { state: 'visible', timeout: 5000 });
        console.log('Modal Opened!');
    } catch {
        console.log('Modal did not open, but hopefully request was sent.');
    }

    // Keep open briefly
    await page.waitForTimeout(3000);

    await browser.close();
})();
