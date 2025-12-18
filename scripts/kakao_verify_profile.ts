import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

async function verifyProfileExtraction() {
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

        // Find a chat item
        const targetLiSelector = '.list_board li:has(.num_round), .list_board li';
        const targetLi = await page.waitForSelector(targetLiSelector, { timeout: 5000 });

        if (targetLi) {
            // Extract Chat ID
            const chatId = await targetLi.$eval('input.inp_g', el => el.id.replace('chat-select-', ''));
            console.log(`Extracted Chat ID: ${chatId}`);

            const chatUrl = `https://business.kakao.com/_hxlxnIs/chats/${chatId}`;
            console.log(`Navigating directly to: ${chatUrl}`);

            await page.goto(chatUrl);

            console.log('Waiting for chat window to load...');
            await Promise.race([
                page.waitForSelector('.area_tit', { timeout: 20000 }),
                page.waitForSelector('.tit_chat', { timeout: 20000 }) // Alternative selector
            ]);
            console.log('Chat window loaded.');

            // Wait a bit for dynamic content
            await page.waitForTimeout(2000);

            // Try to extract the name from the header
            // Based on common structure, it might be in .area_tit > .tit_chat or similar
            const name = await page.evaluate(() => {
                const titleEl = document.querySelector('.area_tit .tit_chat') || document.querySelector('.area_tit');
                return titleEl ? titleEl.textContent?.trim() : null;
            });

            console.log(`Extracted Profile Name: ${name}`);

            if (name) {
                console.log('Profile extraction successful.');
            } else {
                console.log('Failed to extract profile name. Capturing debug info...');
                await page.screenshot({ path: 'profile_extract_debug.png' });
                const html = await page.content();
                fs.writeFileSync('profile_extract_debug.html', html);
            }

        } else {
            console.log('No chat rooms found.');
        }

    } catch (error) {
        console.error('Error verifying profile extraction:', error);
        await page.screenshot({ path: 'profile_extract_error.png' });
    }

    console.log('Verification complete. Closing browser in 5 seconds...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    await browser.close();
}

verifyProfileExtraction().catch(console.error);
