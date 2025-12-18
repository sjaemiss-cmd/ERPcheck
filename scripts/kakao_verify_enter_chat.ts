import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function verifyEnterChat() {
    const authFile = path.join(process.cwd(), 'kakao_auth.json');
    if (!fs.existsSync(authFile)) {
        console.error('Auth file not found. Please run kakao_login.ts first.');
        return;
    }

    console.log('Launching browser with saved session...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext({ storageState: authFile });
    const page = await context.newPage();

    console.log('Navigating to Kakao Business Chats...');
    await page.goto('https://business.kakao.com/_hxlxnIs/chats');

    console.log('Waiting for chat list...');
    try {
        await page.waitForSelector('.list_board', { timeout: 10000 });

        // Find the first unread chat item
        let targetItem = await page.$('.list_board li:has(.num_round)');

        if (!targetItem) {
            console.log('No unread messages found. Falling back to the first chat room for verification.');
            targetItem = await page.$('.list_board li');
        }

        if (targetItem) {
            const name = await targetItem.$eval('.txt_name', el => el.textContent?.trim());
            console.log(`Clicking on chat: ${name}`);

            // Click the link_chat element inside the li
            await targetItem.click();

            console.log('Waiting for chat window to load...');
            try {
                // Wait for any of these to appear
                await Promise.race([
                    page.waitForSelector('.tf_g', { timeout: 15000 }),
                    page.waitForSelector('.bubble_chat', { timeout: 15000 }),
                    page.waitForSelector('.item_chat', { timeout: 15000 })
                ]);
                console.log('Chat window loaded successfully.');
            } catch (e) {
                console.error('Timeout waiting for chat window. Taking screenshot...');
                await page.screenshot({ path: 'chat_entry_error.png' });
                // Also log the HTML to see what's there
                const html = await page.content();
                fs.writeFileSync('chat_entry_error.html', html);
                throw e;
            }

        } else {
            console.log('No chat rooms found at all.');
        }

    } catch (error) {
        console.error('Error verifying chat entry:', error);
    }

    console.log('Verification complete. Closing browser in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();
}

verifyEnterChat().catch(console.error);
