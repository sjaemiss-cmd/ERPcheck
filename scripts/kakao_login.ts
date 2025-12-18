import { chromium } from 'playwright';
import path from 'path';

async function login() {
    console.log('Launching browser...');
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Navigating to Kakao Business...');
    await page.goto('https://business.kakao.com/_hxlxnIs/chats');

    console.log('--------------------------------------------------');
    console.log('ACTION REQUIRED:');
    console.log('1. Log in manually in the browser window.');
    console.log('2. When finished, look for the Playwright Inspector window.');
    console.log('3. Click the "Resume" (Play) button in the Inspector to save the session.');
    console.log('--------------------------------------------------');

    // Pause execution to allow manual login. 
    // This opens the Playwright Inspector.
    await page.pause();

    // Save storage state
    const authFile = path.join(process.cwd(), 'kakao_auth.json');
    await context.storageState({ path: authFile });
    console.log(`Session saved to ${authFile}`);

    await browser.close();
}

login().catch((error) => {
    console.error('Error during login script:', error);
    process.exit(1);
});
