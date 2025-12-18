import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function runKakaoLoop() {
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

    // Loop configuration
    const MAX_ITERATIONS = 5; // Safety limit for verification
    let iteration = 0;

    while (iteration < MAX_ITERATIONS) {
        iteration++;
        console.log(`\n--- Iteration ${iteration} ---`);

        try {
            console.log('Checking for unread messages...');
            await page.waitForSelector('.list_board', { timeout: 10000 });

            // Find unread chat items
            const unreadSelector = '.list_board li:has(.num_round)';
            let unreadItems = await page.$$(unreadSelector);

            if (unreadItems.length === 0) {
                console.log('No unread messages found. Falling back to ANY chat for verification.');
                unreadItems = await page.$$('.list_board li');
            }

            if (unreadItems.length > 0) {
                console.log(`Found ${unreadItems.length} chats to process.`);

                // Process the first item
                const targetLi = unreadItems[0];

                // Extract Chat ID
                const chatId = await targetLi.$eval('input.inp_g', el => el.id.replace('chat-select-', ''));
                console.log(`Processing Chat ID: ${chatId}`);

                const chatUrl = `https://business.kakao.com/_hxlxnIs/chats/${chatId}`;
                console.log(`Navigating to: ${chatUrl}`);

                await page.goto(chatUrl);

                // Wait for chat load
                await Promise.race([
                    page.waitForSelector('textarea#chatWrite', { timeout: 20000 }),
                    page.waitForSelector('.item_chat', { timeout: 20000 }),
                    page.waitForSelector('.area_tit', { timeout: 20000 })
                ]);

                // Wait for dynamic content
                await page.waitForTimeout(2000);

                // 1. Extract Profile
                const profileName = await page.evaluate(() => {
                    const titleEl = document.querySelector('.area_tit .tit_chat') || document.querySelector('.area_tit');
                    return titleEl ? titleEl.textContent?.trim() : 'Unknown';
                });
                console.log(`Profile Name: ${profileName}`);

                // 2. Parse Messages
                const messageItems = await page.$$('.item_chat');
                const parsedMessages = [];
                for (const item of messageItems) {
                    const isMe = await item.evaluate(el => el.classList.contains('item_me'));
                    const speaker = isMe ? 'Counselor' : 'Customer';
                    const text = await item.evaluate(el => {
                        const chatText = el.querySelector('.txt_chat');
                        if (chatText) return chatText.textContent?.trim();
                        const titItem = el.querySelector('.tit_item');
                        if (titItem) return titItem.textContent?.trim();
                        return null;
                    });
                    if (text) parsedMessages.push({ speaker, text });
                }

                const lastCustomerMessage = [...parsedMessages].reverse().find(m => m.speaker === 'Customer');
                console.log(`Last Customer Message: ${lastCustomerMessage?.text || 'None'}`);

                // TODO: Send to LLM/ERP (Placeholder)
                console.log('>> Data ready for processing.');

                // Return to list
                console.log('Returning to chat list...');
                await page.goto('https://business.kakao.com/_hxlxnIs/chats');

            } else {
                console.log('No unread messages. Waiting...');
                await page.waitForTimeout(5000); // Wait 5 seconds before next check
            }

        } catch (error) {
            console.error('Error in loop:', error);
            await page.screenshot({ path: `loop_error_${iteration}.png` });
            // Recover by going back to list
            await page.goto('https://business.kakao.com/_hxlxnIs/chats');
        }
    }

    console.log('Loop finished (max iterations reached). Closing browser...');
    await browser.close();
}

runKakaoLoop().catch(console.error);
