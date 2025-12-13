const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    console.log('Starting debug inspector...');
    const browser = await chromium.launch({ headless: false }); // Visible for user to see
    const page = await browser.newPage();

    try {
        // 1. Login
        console.log('Logging in...');
        await page.goto('https://sook0517.cafe24.com/');
        await page.fill('input[name="id"]', 'dobong');
        await page.fill('input[name="pwd"]', '1010');
        await page.click('button[type="submit"]');

        // Wait for redirect
        await page.waitForTimeout(3000);
        console.log('Current URL after login:', page.url());

        // 2. Go to Calendar
        console.log('Navigating to calendar...');
        await page.goto('https://sook0517.cafe24.com/index/calender');
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);

        // 3. Inspect Events
        console.log('Inspecting events...');
        const events = await page.evaluate(() => {
            const els = Array.from(document.querySelectorAll('.fc-event'));
            return els.map(el => ({
                text: el.innerText,
                html: el.outerHTML,
                classes: el.className
            }));
        });

        console.log(`Found ${events.length} events.`);
        fs.writeFileSync('debug_events.json', JSON.stringify(events, null, 2));

        // 4. Try to click the first "student" event (not "운영")
        const targetEvent = events.find(e => !e.text.includes('운영'));
        if (targetEvent) {
            console.log('Attempting to click event:', targetEvent.text);

            // Re-evaluate to find the element handle
            const clicked = await page.evaluate((text) => {
                const els = Array.from(document.querySelectorAll('.fc-event'));
                const target = els.find(el => el.innerText.includes(text));
                if (target) {
                    target.click();
                    return true;
                }
                return false;
            }, targetEvent.text);

            if (clicked) {
                console.log('Event clicked. Waiting for modal...');
                await page.waitForTimeout(2000);
                await page.screenshot({ path: 'debug_modal_open.png' });

                // Check for modal HTML
                const modalHtml = await page.content();
                fs.writeFileSync('debug_page_source.html', modalHtml);
            } else {
                console.log('Could not click event via JS match.');
            }
        }

    } catch (e) {
        console.error('Error:', e);
        await page.screenshot({ path: 'debug_error.png' });
    } finally {
        console.log('Closing browser...');
        await browser.close();
    }
})();
