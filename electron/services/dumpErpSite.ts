/**
 * ERP Site Structure Dump Utility
 * 
 * This script logs into the ERP and dumps HTML of key pages
 * for future reference. Run with: npx ts-node electron/services/dumpErpSite.ts
 */

import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DUMP_DIR = path.join(__dirname, '../../erp_dumps');
const BASE_URL = 'http://sook0517.cafe24.com';

async function ensureDumpDir() {
    if (!fs.existsSync(DUMP_DIR)) {
        fs.mkdirSync(DUMP_DIR, { recursive: true });
    }
}

async function saveHtml(filename: string, html: string) {
    const filepath = path.join(DUMP_DIR, filename);
    fs.writeFileSync(filepath, html, 'utf-8');
    console.log(`[Dump] Saved: ${filepath}`);
}

async function main() {
    console.log('[Dump] Starting ERP site structure dump...');
    await ensureDumpDir();

    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        // 1. Login Page
        console.log('[Dump] Fetching login page...');
        await page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
        await saveHtml('01_login_page.html', await page.content());

        // 2. Login
        console.log('[Dump] Logging in...');

        const erpId = process.env.ERP_ID || '';
        const erpPassword = process.env.ERP_PASSWORD || '';
        if (!erpId || !erpPassword) {
            throw new Error('Missing ERP credentials. Set ERP_ID and ERP_PASSWORD env vars.');
        }

        await page.fill('input[name="id"]', erpId);
        await page.fill('input[name="pwd"]', erpPassword);

        page.once('dialog', async dialog => {
            console.log(`[Dump] Dialog: ${dialog.message()}`);
            await dialog.dismiss();
        });

        await page.click('button[type="submit"]');
        await page.waitForURL('**/index/**', { timeout: 15000, waitUntil: 'domcontentloaded' });
        console.log(`[Dump] Logged in. Current URL: ${page.url()}`);

        // 3. Member List Page
        console.log('[Dump] Fetching member list page...');
        await page.goto(`${BASE_URL}/index/member`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000); // Wait for AJAX
        await saveHtml('02_member_list.html', await page.content());

        // 4. Calendar Page
        console.log('[Dump] Fetching calendar page...');
        await page.goto(`${BASE_URL}/index/calender`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(2000);
        await saveHtml('03_calendar.html', await page.content());

        // 5. Try to open a member modal (if there are events)
        console.log('[Dump] Trying to capture member detail modal...');
        try {
            // Click on any event on the calendar
            const event = page.locator('.fc-event').first();
            if (await event.count() > 0) {
                await event.click();
                await page.waitForTimeout(1000);
                await saveHtml('04_member_modal.html', await page.content());
            } else {
                console.log('[Dump] No events found to click');
            }
        } catch (e) {
            console.log('[Dump] Could not capture modal:', e);
        }

        // 6. Try to open "Add Reservation" modal
        console.log('[Dump] Trying to capture add reservation modal...');
        try {
            await page.evaluate(() => {
                // @ts-ignore
                $('#CalenderModalNew').modal('show');
            });
            await page.waitForTimeout(1000);
            await saveHtml('05_add_reservation_modal.html', await page.content());
        } catch (e) {
            console.log('[Dump] Could not capture add reservation modal:', e);
        }

        console.log('[Dump] Done! Check the erp_dumps folder.');

    } catch (e) {
        console.error('[Dump] Error:', e);
    } finally {
        await browser.close();
    }
}

main();
