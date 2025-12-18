import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function verifyParseChat() {
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

        // Find the first unread chat item (or any chat if none unread)
        const targetLiSelector = '.list_board li:has(.num_round), .list_board li';
        const targetLi = await page.waitForSelector(targetLiSelector, { timeout: 5000 });

        if (targetLi) {
            const name = await targetLi.$eval('.txt_name', el => el.textContent?.trim());
            console.log(`Target chat: ${name}`);

            // Extract Chat ID from the checkbox id
            // <input type="checkbox" id="chat-select-4959128377827961" ...>
            const chatId = await targetLi.$eval('input.inp_g', el => el.id.replace('chat-select-', ''));
            console.log(`Extracted Chat ID: ${chatId}`);

            const chatUrl = `https://business.kakao.com/_hxlxnIs/chats/${chatId}`;
            console.log(`Navigating directly to: ${chatUrl}`);

            await page.goto(chatUrl);

            console.log('Waiting for chat window to load...');
            try {
                await Promise.race([
                    page.waitForSelector('textarea#chatWrite', { timeout: 20000 }),
                    page.waitForSelector('.item_chat', { timeout: 20000 }),
                    page.waitForSelector('.area_tit', { timeout: 20000 }),
                    page.waitForSelector('.bubble_chat', { timeout: 20000 })
                ]);
                console.log('Chat window loaded successfully.');

                // Wait a bit for messages to load
                await page.waitForTimeout(3000);

                console.log('Parsing messages...');
                const messageItems = await page.$$('.item_chat');
                console.log(`Found ${messageItems.length} message items.`);

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

                    if (text) {
                        parsedMessages.push({ speaker, text });
                    }
                }

                console.log('--- Parsed Messages ---');
                parsedMessages.forEach((m, i) => {
                    console.log(`[${i + 1}] ${m.speaker}: ${m.text}`);
                });
                console.log('-----------------------');

                const lastCustomerMessage = [...parsedMessages].reverse().find(m => m.speaker === 'Customer');
                if (lastCustomerMessage) {
                    console.log(`Latest Customer Message: ${lastCustomerMessage.text}`);
                } else {
                    console.log('No customer messages found.');
                }
            } catch (e) {
                console.error('Timeout waiting for chat window. Taking screenshot...');
                await page.screenshot({ path: 'chat_parse_error.png' });
                const html = await page.content();
                fs.writeFileSync('chat_parse_error.html', html);
                console.log('Current URL:', page.url());
                throw e;
            }

        } else {
            console.log('No chat rooms found.');
        }

    } catch (error) {
        console.error('Error verifying chat parsing:', error);
    }

    console.log('Verification complete. Closing browser in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();
}

verifyParseChat().catch(console.error);
