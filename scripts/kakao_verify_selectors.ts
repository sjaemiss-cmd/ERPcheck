import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function verifySelectors() {
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

    // Wait for the chat list to load
    console.log('Waiting for chat list...');
    try {
        await page.waitForSelector('.list_board', { timeout: 10000 });
        console.log('Chat list container (.list_board) found.');

        const chatItems = await page.$$('.list_board li');
        console.log(`Found ${chatItems.length} chat items.`);

        if (chatItems.length > 0) {
            const firstItem = chatItems[0];
            const name = await firstItem.$eval('.txt_name', el => el.textContent?.trim());
            const lastMessage = await firstItem.$eval('.txt_info', el => el.textContent?.trim());

            console.log('--- First Chat Item Data ---');
            console.log(`Name: ${name}`);
            console.log(`Last Message: ${lastMessage}`);
            console.log('----------------------------');
        } else {
            console.warn('No chat items found in the list.');
        }
    } catch (error) {
        console.error('Error verifying selectors:', error);
    }

    console.log('Verification complete. Closing browser in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();
}

verifySelectors().catch(console.error);
