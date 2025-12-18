import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

async function verifyErpSearch() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    try {
        // 1. Login
        await page.goto('http://sook0517.cafe24.com/');
        await page.fill("input[name='id']", process.env.ERP_ID || '');
        await page.fill("input[name='pwd']", process.env.ERP_PASSWORD || '');
        await page.click("button.btn-primary");
        try {
            await page.waitForURL('**/index/main', { timeout: 10000 });
        } catch (e) {
            console.log('Main page navigation timeout, checking URL...');
        }

        // 2. Go to Member Page
        console.log('Navigating to Member Page...');
        await page.goto('http://sook0517.cafe24.com/index/member');
        await page.waitForLoadState('domcontentloaded');

        // 3. Dump HTML to find selectors
        const html = await page.content();
        fs.writeFileSync('erp_member_page.html', html);
        console.log('Saved erp_member_page.html');

        // 4. Take Screenshot
        await page.screenshot({ path: 'erp_member_page.png' });
        console.log('Saved erp_member_page.png');

    } catch (e) {
        console.error('Error:', e);
    } finally {
        await browser.close();
    }
}

verifyErpSearch();
