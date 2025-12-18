import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function verifyUnreadFiltering() {
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

        // Selector for unread badge: .num_round
        // We want to find chat items (li) that contain .num_round
        const unreadItems = await page.$$('.list_board li:has(.num_round)');
        console.log(`Found ${unreadItems.length} unread chat items.`);

        for (let i = 0; i < unreadItems.length; i++) {
            const name = await unreadItems[i].$eval('.txt_name', el => el.textContent?.trim());
            const unreadCount = await unreadItems[i].$eval('.num_round', el => el.textContent?.trim());
            console.log(`Unread Chat ${i + 1}: ${name} (${unreadCount} messages)`);
        }

        if (unreadItems.length === 0) {
            console.log('No unread messages found at the moment.');
            // Let's also check all items to see if we can find the badge class anywhere
            const allItems = await page.$$('.list_board li');
            console.log(`Total chat items: ${allItems.length}`);
        }

    } catch (error) {
        console.error('Error verifying unread filtering:', error);
    }

    console.log('Verification complete. Closing browser in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();
}

verifyUnreadFiltering().catch(console.error);
