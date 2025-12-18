import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import * as cheerio from 'cheerio'
import iconv from 'iconv-lite';
import { ipcMain } from 'electron'
import type { DailyData, Student, Customer, ReservationData } from './types.ts'

export class ErpService {
    private browser: Browser | null = null
    private page: Page | null = null
    private isHeadless: boolean = true
    private isBusy: boolean = false

    constructor() {
        this.registerIpcHandlers()
    }

    private registerIpcHandlers() {
        ipcMain.handle('erp:login', async (_, { id, password }) => {
            return await this.login(id, password)
        })



        ipcMain.handle('erp:createReservation', async (_, { data }) => {
            return await this.createReservation(data)
        })

        ipcMain.handle('erp:getTodayEducation', async () => {
            return await this.getTodayEducation()
        })

        ipcMain.handle('erp:getStudentDetail', async (_, { id }) => {
            return await this.getStudentDetail(id)
        })

        // Updated signature to accept name and time for better matching
        ipcMain.handle('erp:updateMemo', async (_, { id, memo, name, time, date }) => {
            return await this.updateMemo(id, memo, name, time, date)
        })

        ipcMain.handle('erp:writeMemosBatch', async (_, { memoList }) => {
            return await this.writeMemosBatch(memoList)
        })

        ipcMain.handle('erp:deleteHistory', async (_, { id, history }) => {
            return await this.deleteHistory(id, history)
        })

        ipcMain.handle('erp:updateHistory', async (_, { id, oldHistory, newHistory }) => {
            return await this.updateHistory(id, oldHistory, newHistory)
        })

        ipcMain.handle('erp:setHeadless', async (_, { headless }) => {
            if (this.isHeadless !== headless) {
                this.isHeadless = headless
                console.log(`[ErpService] Headless mode set to: ${headless}`)

                // If browser is open and idle, close it so next launch picks up new setting
                if (this.browser && !this.isBusy) {
                    console.log('[ErpService] Restarting browser to apply headless setting...')
                    await this.browser.close().catch(e => console.error('Error closing browser:', e))
                    this.browser = null
                    this.page = null
                }
            }
            return true
        })

        ipcMain.handle('erp:getSchedule', async (_, { startDate, endDate }) => {
            return await this.getSchedule(startDate, endDate)
        })

    }

    async start() {
        if (this.browser && !this.browser.isConnected()) {
            this.browser = null
            this.page = null
            this.isBusy = false
        }

        if (this.page && this.page.isClosed()) {
            this.page = null
            this.isBusy = false
        }

        if (!this.browser) {
            console.log('[ErpService] Launching browser...')
            this.browser = await chromium.launch({ headless: this.isHeadless })
            this.browser.on('disconnected', () => {
                console.log('[ErpService] Browser disconnected')
                this.browser = null
                this.page = null
                this.isBusy = false
            })
            this.page = await this.browser.newPage()
            console.log('[ErpService] Browser launched')
        } else if (!this.page) {
            this.page = await this.browser.newPage()
        }
    }

    async login(id: string, pass: string): Promise<boolean> {
        console.log(`[ErpService] login called with id: ${id}`)
        try {
            await this.start()

            if (!this.page) {
                console.error('[ErpService] Page not initialized')
                return false
            }
            const page = this.page

            // HTTP URL (CRITICAL)
            const BASE_URL = 'http://sook0517.cafe24.com'

            // Check if matches HTTP url
            if (page.url().startsWith(BASE_URL) && (page.url().includes('/index/calender') || page.url().includes('/index/main'))) {
                console.log('[ErpService] Already logged in (URL check)')
                return true
            }

            // Navigate to HTTP
            await page.goto(BASE_URL + '/', { waitUntil: 'domcontentloaded' })

            // Check if redirected to main immediately (already logged in)
            if (page.url().includes('/index/calender') || page.url().includes('/index/main')) {
                console.log('[ErpService] Already logged in')
                return true
            }

            try {
                // Robust selectors based on browser analysis
                const idInput = page.locator("input[name='id']").or(page.locator("input[placeholder='아이디']")).first()
                await idInput.waitFor({ state: 'visible', timeout: 5000 })
                await idInput.fill(id)
            } catch (e) {
                console.error('[ErpService] ID input not found')
                return false
            }

            try {
                const pwdInput = page.locator("input[name='pwd']")
                    .or(page.locator("input[placeholder='비밀번호']"))
                    .or(page.locator("input[type='password']")).first()

                if (await pwdInput.count() > 0) {
                    await pwdInput.fill(pass)
                } else {
                    console.error('[ErpService] Password input not found')
                    return false
                }
            } catch (e) {
                console.error('[ErpService] Password fill failed:', e)
                return false
            }

            // Login Button - class .btn-primary or type submit
            await page.click("button.btn-primary, button[type='submit']")

            try {
                await page.waitForNavigation({ timeout: 10000, waitUntil: 'domcontentloaded' })
            } catch (e) {
                console.log('[ErpService] Navigation timeout')
            }

            const url = page.url()
            console.log('[ErpService] URL after login:', url)

            if (url.includes('/index/main') || url.includes('/index/member') || url.includes('/index/calender')) {
                console.log('[ErpService] Login successful')
                return true
            }

            return false
        } catch (e) {
            console.error('[ErpService] Login exception:', e)
            return false
        }
    }

    public async getTodayEducation(): Promise<DailyData> {
        console.log('[ErpService] getTodayEducation called (Throttled Network Mode)');

        if (!this.browser) await this.start();
        if (!this.page) return { operationTime: '', students: [] };
        const page = this.page;

        // Ensure we are on Calendar
        const isCalendar = page.url().includes('calender');
        if (!isCalendar) {
            await this.login('dobong', '1010');
            await page.waitForTimeout(1000);
            if (!page.url().includes('calender')) {
                await page.goto('http://sook0517.cafe24.com/index/calender');
            }
        } else {
            await page.reload();
        }

        try {
            await page.waitForSelector('.fc-event', { timeout: 5000 });
        } catch {
            console.warn('[ErpService] No events found on calendar.');
            return { operationTime: '', students: [] };
        }

        // 1. Scan Metadata & Operation Time (Browser Context)

        // Pass today's date (server time approx) to filter
        const todayStr = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
        console.log(`[ErpService] Filtering events for today: ${todayStr}`);

        const scanResult = await page.evaluate((targetDate) => {
            // @ts-ignore
            const $ = window.$;
            const events: any[] = [];
            let opTime = '';

            $('.fc-event').each((_i: number, el: HTMLElement) => {
                const fcData = $(el).data('fcSeg');
                if (!fcData) return;
                const fcEvent = fcData.event;

                // Date Filter
                const eventDate = fcEvent.start.format('YYYY-MM-DD');
                if (eventDate !== targetDate) return;

                // Check Operation Time
                if (fcEvent.title && fcEvent.title.includes('운영')) {
                    const s = fcEvent.start.format('HH:mm');
                    const e = fcEvent.end ? fcEvent.end.format('HH:mm') : s;
                    opTime = `${s} ~ ${e}`;
                    return;
                }

                events.push({
                    id: fcEvent.id,
                    title: fcEvent.title,
                    start: fcEvent.start.format('HH:mm'),
                    className: fcEvent.className.join(' '),
                    duration: (fcEvent.end - fcEvent.start) / (1000 * 60 * 60)
                });
            });
            return { events, opTime };
        }, todayStr);

        console.log(`[ErpService] Found ${scanResult.events.length} students. OpTime: ${scanResult.opTime}`);

        // 2. Sequential Fetch with Delay (Throttling)
        const students: Student[] = [];
        const context = page.context();

        for (const [index, ev] of scanResult.events.entries()) {
            try {
                // Name Sanitization
                let cleanName = ev.title.replace(/<[^>]*>/g, '').replace(/\[.*?\]/g, '').trim();
                cleanName = cleanName.split(' ')[0];

                console.log(`[ErpService] Fetching ${cleanName} (${index + 1}/${scanResult.events.length})...`);

                // Fetch Body via API
                const response = await context.request.post('http://sook0517.cafe24.com/index.php/dataFunction/getBookingInfo', {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                        'Referer': 'http://sook0517.cafe24.com/index/calender',
                        'Origin': 'http://sook0517.cafe24.com',
                        'X-Requested-With': 'XMLHttpRequest',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    },
                    form: { idx: ev.id, branch_idx: 4 }
                });

                const buffer = await response.body();
                const decodedBody = iconv.decode(buffer as Buffer, 'euc-kr');

                let $;
                try {
                    // API returns JSON with HTML in 'MEMO' field
                    const jsonResponse = JSON.parse(decodedBody);
                    // The 'MEMO' field contains the HTML for the history list
                    const htmlContent = jsonResponse.MEMO || '';
                    $ = cheerio.load(htmlContent);
                    // console.log(`[ErpService] Parsed JSON for ${cleanName}`);
                } catch (e) {
                    console.warn(`[ErpService] Failed to parse JSON for ${cleanName}, trying raw HTML fallback`);
                    $ = cheerio.load(decodedBody);
                }

                const memo = $('textarea[name="memo"]').val() as string || '';
                const history: { date: string, content: string }[] = [];

                $('.form-inline').each((_, row) => {
                    const date = $(row).find('.modify_comment_date').val() as string;
                    const content = $(row).find('.modify_comment_text').val() as string;
                    if (date && content) history.push({ date, content });
                });

                console.log(`[ErpService] ${cleanName}: Found ${history.length} history items, Memo len: ${memo.length}`);

                const photo = $('.view_picture img').attr('src') || '';

                let status: any = 'assigned';
                if (ev.className.includes('bg_blue')) status = 'registered';
                else if (ev.className.includes('bg_green')) status = 'assigned';
                else if (ev.className.includes('bg_yellow')) status = 'completed';

                students.push({
                    id: String(ev.id),
                    name: cleanName,
                    domIdentifier: ev.title,
                    time: ev.start,
                    duration: ev.duration || 1,
                    status: status,
                    type: '기타',
                    generalMemo: memo,
                    history: history,
                    photo: photo,
                    index: index
                } as Student);

                // Throttling: Wait 200ms
                await new Promise(resolve => setTimeout(resolve, 200));

            } catch (e) {
                console.error(`[ErpService] Fetch failed for ${ev.title}`, e);
            }
        }

        // Sort by time
        students.sort((a, b) => a.time.localeCompare(b.time));

        return {
            operationTime: scanResult.opTime,
            students: students
        };
    }

    async getStudentDetail(_id: string): Promise<{ generalMemo: string; history: any[] }> {
        return { generalMemo: '', history: [] }
    }

    // New helper method for core memo logic
    private async _updateMemoCore(eventId: string, memo: string, dateStr?: string): Promise<boolean> {
        console.log(`[ErpService] _updateMemoCore for ID ${eventId} with memo: ${memo}, date: ${dateStr || 'Today'}`)
        if (!this.page) return false
        const page = this.page

        try {
            // 1. Force Navigate Calendar to Target Date (or Today)
            // If dateStr is provided (YYYY-MM-DD), use it. Else use Today KST.
            let targetDateStr = dateStr;
            if (!targetDateStr) {
                const todayKST = new Date().toLocaleString("en-US", { timeZone: "Asia/Seoul" });
                targetDateStr = new Date(todayKST).toISOString().split('T')[0]
            }

            console.log(`[ErpService] Navigating calendar to ${targetDateStr}...`)
            await page.evaluate((date) => {
                // @ts-ignore
                $('#calendar').fullCalendar('gotoDate', date);
            }, targetDateStr);

            // 2. Click Event by ID -> Opens Quick Modal (#CalenderModalEdit)
            console.log('[ErpService] Waiting for events to load...')
            await page.waitForTimeout(1000) // Render wait

            // Use evaluate to find the event div by data-id attribute which fullCalendar renders
            const clickSuccess = await page.evaluate((id) => {
                // @ts-ignore
                const $ = window.$;
                // @ts-ignore
                const events = $('#calendar').fullCalendar('clientEvents');
                const event = events.find((e: any) => String(e.id) === String(id));
                if (event) {
                    // Trigger the click callback manually since finding the specific DOM element is hard
                    // @ts-ignore
                    $('#calendar').fullCalendar('option', 'eventClick')(event, {}, {
                        // mock event object if needed
                        pageX: 0, pageY: 0
                    });
                    return true;
                }
                return false;
            }, eventId);

            if (!clickSuccess) {
                console.error(`[ErpService] Event with ID ${eventId} not found on calendar.`)
                return false
            }

            console.log('[ErpService] Event clicked. Waiting for modal...')
            // 3. Wait for Quick Modal and Click "Modify" to go to Full Modal
            // Robust Wait for Button
            let modifyBtnFound = false
            for (let i = 0; i < 5; i++) {
                // Try finding the specific '회원정보 수정' button
                const btn = page.locator("#CalenderModalEdit .modal-footer button:has-text('회원정보 수정')").first()

                // Also check generic 'Detail' or 'Edit' if text varies, but start specific
                if (await btn.isVisible()) {
                    await btn.click()
                    modifyBtnFound = true
                    break
                }
                await page.waitForTimeout(500)
            }

            if (!modifyBtnFound) {
                console.warn('[ErpService] Modify button not found via DOM. DIAGNOSTIC DUMP:')
                // DUMP HTML of the footer to verify available buttons
                const footerHtml = await page.evaluate(() => {
                    return document.querySelector('#CalenderModalEdit .modal-footer')?.innerHTML || 'No Footer Found';
                });
                console.warn(`[ErpService] Footer HTML: ${footerHtml}`);

                // Fallback: Use direct JS execution to show the modal if button is hidden/glitched
                console.warn('[ErpService] Trying Direct JS Invoke...')

                const jsClick = await page.evaluate(() => {
                    // Try finding validation/modify button specifically by text content in JS
                    const buttons = Array.from(document.querySelectorAll('#CalenderModalEdit .modal-footer button'));
                    const target = buttons.find(b => b.textContent?.includes('수정') || b.textContent?.includes('Modify'));
                    if (target) {
                        (target as HTMLElement).click();
                        return true;
                    }
                    return false;
                })

                if (!jsClick) {
                    console.error('[ErpService] CRITICAL: "Modify Member" button could not be clicked.')
                    // Cleanup
                    await page.evaluate(() => {
                        // @ts-ignore
                        $('#CalenderModalEdit').modal('hide')
                    })
                    return false
                }
            }


            // 4. Wait for Full Modal (#modifyMemberModal)
            try {
                await page.waitForSelector('#modifyMemberModal', { state: 'visible', timeout: 5000 })
                await page.waitForTimeout(1000) // Stabilization
            } catch {
                console.error('[ErpService] Member Modal did not appear')
                return false
            }

            // Add Memo Logic
            // a. Click '+' button
            const plusBtn = page.locator('#modifyMemberModal .comment_btn .plus')
            if (await plusBtn.count() > 0) {
                await plusBtn.click()
                await page.waitForTimeout(500)
            } else {
                console.error('[ErpService] Plus button not found')
            }

            // b. Fill Date and Memo
            const dateInputs = page.locator('#modifyMemberModal input[name="date[]"]')
            const commentInputs = page.locator('#modifyMemberModal input[name="comment[]"]')

            if (await dateInputs.count() > 0) {
                const lastDateInput = dateInputs.last()
                const lastCommentInput = commentInputs.last()

                // Robust Date Filling - Use Type instead of Fill to trigger standard events
                await lastDateInput.click()
                await lastDateInput.clear() // Clear default if any
                await page.waitForTimeout(100)
                await lastDateInput.type(targetDateStr, { delay: 100 }) // Type slowly
                await page.waitForTimeout(100)
                await lastDateInput.press('Tab') // Commit value
                await page.waitForTimeout(200)

                // Verify value stuck
                const val = await lastDateInput.inputValue()
                if (val !== targetDateStr) {
                    console.warn(`[ErpService] value mismatch! wanted ${targetDateStr} got ${val}. Forcing value via eval...`)
                    await lastDateInput.evaluate((el: HTMLInputElement, date: string) => {
                        el.value = date
                        // Trigger every possible event to satisfy jquery validation
                        el.dispatchEvent(new Event('input', { bubbles: true }));
                        el.dispatchEvent(new Event('change', { bubbles: true }));
                        el.dispatchEvent(new Event('blur', { bubbles: true }));
                        // JQuery trigger if available
                        // @ts-ignore
                        if (window.$) { window.$(el).trigger('change'); }
                    }, targetDateStr)
                }

                await page.waitForTimeout(200)

                // Robust Comment Filling - Type as well
                await lastCommentInput.click()
                await lastCommentInput.type(memo, { delay: 50 })
            } else {
                console.error('[ErpService] No inputs found for memo')
            }

            // c. Click Save
            const saveBtn = page.locator("#modifyMemberModal button:has-text('수정')").or(page.locator("#modifyMemberModal button:has-text('저장')")).first()

            if (await saveBtn.count() > 0) {
                // Handle alert
                page.once('dialog', dialog => dialog.accept())
                await saveBtn.click()
                await page.waitForTimeout(1000) // Wait for save
            } else {
                console.error('[ErpService] Save button not found')
            }

            // Close modals cleanup
            await page.evaluate(() => {
                // @ts-ignore
                $('#modifyMemberModal').modal('hide')
                // @ts-ignore
                $('#CalenderModalEdit').modal('hide')
                // @ts-ignore
                $('.modal').modal('hide')
            })
            await page.waitForTimeout(500)
            return true

        } catch (e) {
            console.error(`[ErpService] Error in _updateMemoCore for ${eventId}:`, e)
            return false
        }
    }

    // Updated updateMemo to use ID
    async updateMemo(id: string, memo: string, _name?: string, _time?: string, date?: string): Promise<boolean> {
        console.log(`[ErpService] updateMemo called for ID ${id} with memo: ${memo}, date: ${date}`)

        if (!id) {
            console.error('[ErpService] ID missing for updateMemo')
            return false
        }

        if (this.isBusy) {
            console.warn('[ErpService] Service is busy')
            return false
        }
        this.isBusy = true

        try {
            await this.start()
            if (!this.page) {
                this.isBusy = false
                return false
            }

            // LOGIN CHECK
            const loginSuccess = await this.login('dobong', '1010')
            if (!loginSuccess) {
                console.error('[ErpService] Login failed during updateMemo')
                this.isBusy = false
                return false
            }

            // Ensure we are on calendar page
            if (!this.page.url().includes('/index/calender')) {
                await this.page.goto('http://sook0517.cafe24.com/index/calender', { waitUntil: 'domcontentloaded' })
            }

            const success = await this._updateMemoCore(id, memo, date)

            this.isBusy = false
            return success

        } catch (e) {
            console.error('[ErpService] Error in updateMemo:', e)
            this.isBusy = false
            return false
        }
    }

    async writeMemosBatch(memoList: { index: number; text: string; id: string; name: string; time: string; date?: string }[]): Promise<Record<number, boolean>> {
        console.log(`[ErpService] writeMemosBatch called with ${memoList.length} items`)
        const results: Record<number, boolean> = {}

        if (this.isBusy) {
            console.warn('[ErpService] Service is busy')
            return {}
        }
        this.isBusy = true

        try {
            await this.start()
            if (!this.page) {
                this.isBusy = false
                return {}
            }

            // 1. Login ONCE
            const loginSuccess = await this.login('dobong', '1010')
            if (!loginSuccess) {
                console.error('[ErpService] Login failed during batch')
                this.isBusy = false
                return {}
            }

            // 2. Ensure Calendar ONCE
            if (!this.page.url().includes('/index/calender')) {
                await this.page.goto('http://sook0517.cafe24.com/index/calender', { waitUntil: 'domcontentloaded' })
            }

            // 3. Loop
            for (const item of memoList) {
                console.log(`[ErpService] Batch processing: ${item.name} (${item.id}) - Date: ${item.date}`)
                const success = await this._updateMemoCore(item.id, item.text, item.date)
                results[item.index] = success

                if (!success) {
                    console.error(`[ErpService] Failed to write memo for ${item.name}`)
                }

                await this.page.waitForTimeout(1000)
            }

            // Close browser after batch is done
            if (this.browser) {
                console.log('[ErpService] Batch finished, closing browser')
                await this.browser.close()
                this.browser = null
                this.page = null
            }

            this.isBusy = false
            return results

        } catch (e) {
            console.error('[ErpService] Error in writeMemosBatch:', e)
            this.isBusy = false
            return results
        }
    }

    private async _modifyHistoryCore(eventId: string, targetHistory: { date: string, content: string }, action: 'delete' | 'update', newHistory?: { date: string, content: string }): Promise<boolean> {
        console.log(`[ErpService] _modifyHistoryCore: ${action} for ID ${eventId}`)
        if (!this.page) return false
        const page = this.page

        try {
            // Ensure we are on the correct date (Today)
            const todayStr = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];
            console.log(`[ErpService] Navigating calendar to ${todayStr}...`)

            await page.evaluate((date) => {
                // @ts-ignore
                $('#calendar').fullCalendar('gotoDate', date);
            }, todayStr);

            console.log(`[ErpService] Waiting for events to load...`)
            try {
                await page.waitForSelector('.fc-event', { state: 'visible', timeout: 5000 })
            } catch (e) {
                console.error('[ErpService] Timeout waiting for .fc-event')
                return false
            }

            // Find event by ID using page.evaluate (Robust)
            const foundEvent = await page.evaluate((targetId) => {
                // @ts-ignore
                const $ = window.$;
                let match = false;
                $('.fc-event').each((_i: number, el: HTMLElement) => {
                    if (match) return; // already found
                    const fcData = $(el).data('fcSeg');
                    if (fcData && String(fcData.event.id) === String(targetId)) {
                        $(el).click(); // Click immediately from inside browser context
                        match = true;
                    }
                });
                return match;
            }, eventId);

            if (!foundEvent) {
                console.error(`[ErpService] Event with ID ${eventId} not found on calendar.`);
                return false;
            }

            console.log(`[ErpService] Event clicked. Waiting for modal...`)

            // 1. Wait for Quick Edit Modal (#CalenderModalEdit)
            try {
                await page.waitForSelector('#CalenderModalEdit', { state: 'visible', timeout: 3000 })
            } catch {
                console.warn('[ErpService] Quick Edit Modal did not appear, checking if Modify Modal is already open...')
            }

            // 2. Click "Modify Member" ('회원정보 수정')
            const modifyBtn = page.locator("#CalenderModalEdit button:has-text('회원정보 수정')")
            if (await modifyBtn.count() > 0 && await modifyBtn.isVisible()) {
                await modifyBtn.click()
            } else {
                if (await page.locator('#modifyMemberModal').count() === 0) {
                    console.error('[ErpService] "Modify Member" button not found and Modify Modal not open.')
                    return false;
                }
            }

            // 3. Wait for History Modal
            await page.waitForSelector('#modifyMemberModal', { state: 'visible', timeout: 5000 })
            await page.waitForTimeout(500)

            // NEW STRATEGY: Iterate inputs matching name='date[]' directly
            // The HTML dump proves these are the specific inputs for Education/Memo
            const dateInputs = page.locator('#modifyMemberModal input[name="date[]"]')
            const contentInputs = page.locator('#modifyMemberModal input[name="comment[]"]')

            const count = await dateInputs.count()
            console.log(`[ErpService] Found ${count} history date inputs (name="date[]").`)

            if (count === 0) {
                console.error('[ErpService] No history inputs found.');
                return false;
            }

            let foundIndex = -1

            for (let i = 0; i < count; i++) {
                const dateVal = (await dateInputs.nth(i).inputValue()).trim()
                const contentVal = (await contentInputs.nth(i).inputValue()).trim()

                console.log(`[ErpService] History Item ${i}: "${dateVal}" | "${contentVal}"`)

                if (dateVal === targetHistory.date.trim() && contentVal === targetHistory.content.trim()) {
                    foundIndex = i
                    break
                }
            }

            if (foundIndex === -1) {
                console.error('[ErpService] Target history not found')
                await page.evaluate(() => {
                    // @ts-ignore
                    $('.modal').modal('hide')
                })
                return false
            }

            console.log(`[ErpService] Target found at index ${foundIndex}`)

            const targetDateInput = dateInputs.nth(foundIndex)
            // Use XPath to find the parent row regardless of its class
            const targetRow = targetDateInput.locator('xpath=..')

            if (action === 'delete') {
                const minusBtn = targetRow.locator('.minus')
                if (await minusBtn.count() > 0) {
                    console.log('[ErpService] Delete: clicking minus button and accepting dialog...');
                    page.once('dialog', async dialog => {
                        console.log(`[ErpService] Dialog detected: ${dialog.message()}`);
                        await dialog.accept();
                    });
                    await minusBtn.click()
                } else {
                    console.warn('[ErpService] No minus button, clearing text inputs')
                    await targetDateInput.fill('')
                    await contentInputs.nth(foundIndex).fill('')
                }
            } else if (action === 'update' && newHistory) {
                await targetDateInput.fill(newHistory.date)
                await contentInputs.nth(foundIndex).fill(newHistory.content)
            }

            // Click Save
            const saveBtn = page.locator("#modifyMemberModal button:has-text('수정')").or(page.locator("#modifyMemberModal button:has-text('저장')")).first()

            if (await saveBtn.count() > 0) {
                page.once('dialog', dialog => dialog.accept())
                await saveBtn.click()
                await page.waitForTimeout(1000)
            } else {
                console.error('[ErpService] Save button not found')
                await page.evaluate(() => {
                    // @ts-ignore
                    $('.modal').modal('hide')
                })
                return false
            }

            // Close modals
            await page.evaluate(() => {
                // @ts-ignore
                $('#modifyMemberModal').modal('hide')
                // @ts-ignore
                $('#CalenderModalEdit').modal('hide')
                // @ts-ignore
                $('.modal').modal('hide')
            })
            await page.waitForTimeout(500)
            return true

        } catch (e) {
            console.error('[ErpService] Error in _modifyHistoryCore:', e)
            try {
                await this.page?.evaluate(() => {
                    // @ts-ignore
                    $('.modal').modal('hide')
                })
            } catch { }
            return false
        }
    }

    async deleteHistory(eventId: string, history: { date: string, content: string }): Promise<boolean> {
        return this.wrapErpOperation(eventId, (id) => this._modifyHistoryCore(id, history, 'delete'))
    }

    async updateHistory(eventId: string, oldHistory: { date: string, content: string }, newHistory: { date: string, content: string }): Promise<boolean> {
        return this.wrapErpOperation(eventId, (id) => this._modifyHistoryCore(id, oldHistory, 'update', newHistory))
    }

    // Helper wrapper for login/nav boilerplate
    private async wrapErpOperation(eventId: string, operation: (id: string) => Promise<boolean>): Promise<boolean> {
        if (this.isBusy) {
            console.warn('[ErpService] Service is busy')
            return false
        }
        this.isBusy = true

        try {
            await this.start()
            if (!this.page) {
                this.isBusy = false
                return false
            }

            const loginSuccess = await this.login('dobong', '1010')
            if (!loginSuccess) {
                this.isBusy = false
                return false
            }

            if (!this.page.url().includes('/index/calender')) {
                await this.page.goto('http://sook0517.cafe24.com/index/calender', { waitUntil: 'domcontentloaded' })
            }

            const success = await operation(eventId)

            this.isBusy = false
            return success
        } catch (e) {
            console.error('[ErpService] wrapper error:', e)
            this.isBusy = false
            return false
        }
    }

    /**
     * Maps Naver Booking Data to ERP Format and creates reservation.
     * Implements logic from docs/NAVER_TO_ERP_MAPPING.md
     */
    async registerToErp(naverBooking: any, dryRun: boolean = false): Promise<boolean> {
        console.log(`[ErpService] registerToErp processing: ${naverBooking.user_name} (DryRun: ${dryRun})`);

        // 1. Parse Date ("2025. 12. 18.(목) 오전 11:30")
        const dateMatch = naverBooking.date_string.match(/(\d{4})\. (\d{1,2})\. (\d{1,2})/);
        if (!dateMatch) {
            console.error('[ErpService] Invalid date format:', naverBooking.date_string);
            return false;
        }
        const date = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;

        // 2. Parse Time ("오전 11:30", "오후 12:30", "오후 1:00")
        let timeStr = naverBooking.date_string.split(') ')[1] || ''; // "오전 11:30"
        timeStr = timeStr.trim();

        // Remove trailing texts if any
        if (timeStr.includes('(')) timeStr = timeStr.split('(')[0].trim();

        let [ampm, clock] = timeStr.split(' ');
        if (!clock && ampm.includes(':')) {
            clock = ampm;
            ampm = "오전"; // default/fallback
        }

        let [hour, minute] = (clock || "09:00").split(':').map(Number);

        if (ampm === '오후' && hour < 12) hour += 12;
        if (ampm === '오전' && hour === 12) hour = 0; // 12 AM

        const startTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

        // Calculate End Time (Default 1 hour)
        let endHour = hour + 1;
        let endTime = `${String(endHour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;

        // 3. Map Product/Options to Goods ID
        // 3. Map Product/Options to Goods ID
        let goodsIdx = "6268"; // Default (fallback)
        const p = naverBooking.product || '';
        const o = naverBooking.options || '';
        const full = (p + o).replace(/\s/g, '');

        console.log(`[ErpService] Mapping - Product: "${p}", Option: "${o}"`);

        // Mapping Logic based on mapping.csv
        if (p.includes('이용문의') || p.includes('상담')) {
            // 1,2종 면허취득 및 장롱면허 이용문의 -> NONE
            goodsIdx = "NONE";
        } else if (p.includes('체험권') && o.includes('2종자동')) {
            goodsIdx = "6236";
        } else if (o.includes('1종자동') && o.includes('기능') && o.includes('도로')) {
            goodsIdx = "6226"; // 1종자동(기능+도로)
        } else if (o.includes('1종수동') && o.includes('기능') && o.includes('도로')) {
            goodsIdx = "6229"; // 1종수동(기능+도로)
        } else if (o === '1종자동' || full.includes('1종자동')) {
            // Strictly just 1종자동 (if not caught above)
            goodsIdx = "6240";
        } else if (o === '1종수동' || full.includes('1종수동')) {
            goodsIdx = "6244";
        } else if (p.includes('합격무제한') || o.includes('2종(기능+도로)')) {
            goodsIdx = "6223";
        } else if (o.includes('1종') && o.includes('도로')) {
            goodsIdx = "6228"; // 1종(도로)
        } else if (o.includes('2종') && o.includes('도로')) {
            goodsIdx = "6222"; // 2종(도로)
        } else if (o.includes('2종') && o.includes('기능')) {
            goodsIdx = "6221"; // 2종(기능)
        } else if (o.includes('6시간')) {
            goodsIdx = "6237";
        } else if (o.includes('12시간')) {
            goodsIdx = "6238";
        } else if (o.includes('24시간')) {
            goodsIdx = "6239";
        }

        // Special Case: Consultation Duration Override
        if (goodsIdx === "NONE") {
            // Recalculate End Time (30 mins)
            const [h, m] = startTime.split(':').map(Number);
            const endDate = new Date(2000, 0, 1, h, m + 30);
            endTime = `${String(endDate.getHours()).padStart(2, '0')}:${String(endDate.getMinutes()).padStart(2, '0')}`;
            console.log(`[ErpService] -> Matched Consultation! Set 30min duration: ${startTime} ~ ${endTime}`);
        }

        // 4. Construct Payload
        const displayName = goodsIdx === "NONE" ? `${naverBooking.user_name}/상담` : naverBooking.user_name;

        const payload = {
            name: displayName,
            phone: naverBooking.user_phone,
            date: date,
            start_time: startTime,
            end_time: endTime,
            product: naverBooking.product,
            option: naverBooking.options,
            goods_idx: goodsIdx,
            memberType: 'existing',
            seat_id: null,
            dryRun: dryRun
        };

        // 5. Call Core Creation Logic
        return await this.createReservation(payload);
    }

    async createReservation(data: any): Promise<boolean> {
        console.log(`[ErpService] createReservation called for ${data.name}, type: ${data.memberType || 'auto'}`)

        let seatId = data.seat_id;

        // Fallback Seat Logic - Consultation uses dobong-9
        if (!seatId) {
            const product = data.product || '';
            const goodsIdx = data.goods_idx || '';

            if (goodsIdx === 'NONE' || product.includes('상담') || product.includes('이용문의')) {
                seatId = 'dobong-9';
            } else {
                seatId = 'dobong-1';
            }
            console.log(`[ErpService] Seat ID inferred: ${seatId}`);
        }

        try {
            await this.start()
            if (!this.page) return false
            const page = this.page

            // 1. Ensure Calendar Page
            if (!page.url().includes('/index/calender')) {
                await page.goto('http://sook0517.cafe24.com/index/calender', { waitUntil: 'domcontentloaded' })
            }

            // 2. Open Modal
            await page.evaluate((date) => {
                // @ts-ignore
                $('#calendar').fullCalendar('gotoDate', date);
                // @ts-ignore
                $('#calendar').fullCalendar('changeView', 'agendaDay');
            }, data.date);

            await page.waitForTimeout(1000)

            // Check for Duplicate Reservation (Optimistic Check)
            const isDuplicate = await page.evaluate((arg) => {
                // @ts-ignore
                const events = $('#calendar').fullCalendar('clientEvents');
                // @ts-ignore
                const found = events.find(e => {
                    if (!e.title || !e.start) return false;
                    // Check Title (Name)
                    const titleMatch = e.title.includes(arg.name);
                    // Check Time (HH:mm)
                    const eventTime = e.start.format('HH:mm'); // Moment.js object
                    const timeMatch = eventTime === arg.startTime;
                    return titleMatch && timeMatch;
                });
                return !!found;
            }, { name: data.name, startTime: data.start_time });

            if (isDuplicate) {
                console.log(`[ErpService] Duplicate reservation found for ${data.name} at ${data.start_time}. Skipping.`);
                return true;
            }

            try {
                const clicked = await page.evaluate(() => {
                    const btn = document.querySelector('button.add_cal_btn');
                    if (btn) { (btn as HTMLElement).click(); return true; }
                    return false;
                });
                if (!clicked) {
                    await page.click("button:has-text('일정 추가')", { timeout: 2000 });
                }
            } catch (e) {
                console.warn('[ErpService] Add button click failed, trying JS modal show');
                await page.evaluate(() => {
                    // @ts-ignore
                    $('#CalenderModalNew').modal('show');
                });
            }

            const modalSelector = '#CalenderModalNew';
            await page.waitForSelector(modalSelector, { state: 'visible', timeout: 5000 });

            // 3. Fill Date
            await page.evaluate((date) => {
                // @ts-ignore
                $('#insDate').val(date);
                try { $('#insDate').datepicker('destroy'); } catch (e) { }
                // @ts-ignore
                $('#insDate').trigger('change');
            }, data.date);

            await page.waitForTimeout(800);

            // 4. Time Selection
            const [sH, sM] = data.start_time.split(':');
            const [eH, eM] = data.end_time.split(':');

            await page.selectOption(`${modalSelector} #insStime`, sH);
            await page.selectOption(`${modalSelector} #insStime_min`, sM);
            await page.selectOption(`${modalSelector} #insEtime`, eH);
            await page.selectOption(`${modalSelector} #insEtime_min`, eM);

            // 5. Member Handling
            let isExistingMember = data.memberType === 'existing';

            if (isExistingMember) {
                try {
                    await page.click(`${modalSelector} input.type_member_a`);
                    await page.waitForTimeout(200);

                    let found = false;
                    if (data.customerId) {
                        console.log(`[ErpService] Selecting member by ID: ${data.customerId}`);
                        await page.selectOption(`${modalSelector} #member_select`, data.customerId);
                        found = true;
                    } else {
                        const memberValue = await page.evaluate((targetName) => {
                            // @ts-ignore
                            const options = $(`#CalenderModalNew #member_select option`);
                            let foundVal = null;
                            // @ts-ignore
                            options.each(function () {
                                // @ts-ignore
                                if ($(this).text().includes(targetName)) {
                                    // @ts-ignore
                                    foundVal = $(this).val();
                                    return false;
                                }
                            });
                            return foundVal;
                        }, data.name);

                        if (memberValue) {
                            console.log(`[ErpService] Found existing member: ${data.name} -> ${memberValue}`);
                            await page.selectOption(`${modalSelector} #member_select`, memberValue);
                            found = true;
                        } else {
                            console.warn(`[ErpService] Member ${data.name} not found in dropdown. Falling back to New Member input.`);
                            isExistingMember = false; // Trigger fallback
                        }
                    }
                } catch (e) {
                    console.error('[ErpService] Member selection failed, falling back to New Member:', e);
                    isExistingMember = false;
                }
            }
            // 6. New Member Input
            if (!isExistingMember) {
                await page.click(`${modalSelector} input.type_member_b`);
                await page.waitForTimeout(200);
                await page.fill(`${modalSelector} #member_ins_name`, data.name);
                if (data.phone) {
                    await page.fill(`${modalSelector} #insPhone`, data.phone);
                }
                try {
                    await page.selectOption(`${modalSelector} .birth_year`, "2000");
                    await page.selectOption(`${modalSelector} .birth_month`, "01");
                    await page.selectOption(`${modalSelector} .birth_day`, "01");
                } catch (e) { }
            }

            // 7. Product Selection - Handle NONE (Consultation)
            const goodsVal = data.goods_idx || "6268";

            try {
                if (goodsVal === "NONE") {
                    console.log('[ErpService] Selecting No Product (Consultation).');

                    // Use JS/jQuery to toggle hidden checkbox directly (Cleaner, avoids 'visible' error)
                    const noProductClicked = await page.evaluate((selector) => {
                        // @ts-ignore
                        const cb = $(`${selector} .nullGoods`);
                        if (cb.length > 0) {
                            if (!cb.prop('checked')) {
                                cb.prop('checked', true).trigger('change');
                            }
                            return true;
                        }
                        return false;
                    }, modalSelector);

                    if (noProductClicked) {
                        console.log('[ErpService] Checked .nullGoods via jQuery');
                    } else {
                        // Fallback: click label by text if class not found
                        await page.click("label:has-text('상품없음')").catch(e =>
                            console.warn('[ErpService] Failed to click No Product label:', e)
                        );
                    }
                } else {
                    await page.selectOption('select[name="goods_idx"]', goodsVal);
                }
            } catch (e) {
                console.warn('[ErpService] Error selecting product:', e);
                if (goodsVal !== "NONE") {
                    try { await page.selectOption('select[name="goods_idx"]', { index: 1 }); } catch (e) { }
                }
            }

            // 8. Payment
            try {
                await page.selectOption(`${modalSelector} .payment_select`, "12"); // Naver Pay
            } catch (e) { }

            // 9. Seat Selection (Retry Logic)
            console.log(`[ErpService] Selecting seat: ${seatId}`);
            let seatSelected = false;

            for (let i = 0; i < 5; i++) {
                const options = await page.evaluate((selector) => {
                    // @ts-ignore
                    const sel = $(`${selector} select#insMachine`);
                    const opts: any[] = [];
                    // @ts-ignore
                    sel.find('option').each(function () {
                        // @ts-ignore
                        opts.push({ text: $(this).text(), value: $(this).val() });
                    });
                    return opts;
                }, modalSelector);

                if (options.length <= 1) { // Only default option
                    await page.waitForTimeout(500);
                    continue;
                }

                let targetVal = null;

                // Explicit Mapping for Consultation Seat
                if (seatId === 'dobong-9') {
                    const found = options.find((o: any) => o.value == '28' || o.text.includes('dobong-9'));
                    if (found) targetVal = found.value;
                }

                if (!targetVal) {
                    // Exact -> Partial -> Number match
                    const exact = options.find((o: any) => o.text === seatId);
                    if (exact) targetVal = exact.value;
                    else {
                        const partial = options.find((o: any) => o.text.includes(seatId));
                        if (partial) targetVal = partial.value;
                    }
                }

                if (targetVal) {
                    await page.selectOption(`${modalSelector} #insMachine`, targetVal);
                    seatSelected = true;
                    break;
                }
                await page.waitForTimeout(500);
            }

            if (!seatSelected) {
                console.warn(`[ErpService] Could not find seat option for ${seatId}. Proceeding without specific seat.`);
            }

            // 10. Submit
            if (data.dryRun) {
                console.log('[ErpService] DryRun: Skipping final submit click and closing modal.');
                try {
                    await page.evaluate(() => {
                        // @ts-ignore
                        $('.modal').modal('hide');
                    });
                } catch { }
                return true;
            }

            // Dialog Handler to catch alerts
            page.once('dialog', async dialog => {
                console.log(`[ErpService] Dialog detected: ${dialog.message()}`);
                await dialog.dismiss();
            });

            // Debug: Log values before submit
            const debugVals = await page.evaluate((selector) => {
                return {
                    // @ts-ignore
                    name: $(`${selector} #member_ins_name`).val(),
                    // @ts-ignore
                    phone: $(`${selector} #insPhone`).val(),
                    // @ts-ignore
                    goods: $(`${selector} select[name="goods_idx"]`).val(),
                    // @ts-ignore
                    machine: $(`${selector} #insMachine`).val(),
                    // @ts-ignore
                    noProduct: $('.nullGoods').prop('checked')
                }
            }, modalSelector);
            console.log('[ErpService] Pre-submit Values:', JSON.stringify(debugVals));

            await page.click(`${modalSelector} button.antosubmit`);

            try {
                await page.waitForSelector(modalSelector, { state: 'hidden', timeout: 15000 });
            } catch (e) {
                console.warn('[ErpService] Modal did not close within timeout. Checking for validation errors...');
                // Check for potential error messages
                const errorText = await page.evaluate(() => {
                    // Look for common error containers or alerts
                    // @ts-ignore
                    return document.body.innerText.match(/필수|입력|확인|오류|Error|Invalid/gi);
                });
                console.warn('[ErpService] Visible Text Snippets:', errorText);
                throw e;
            }

            return true;

        } catch (e) {
            console.error('[ErpService] Create Reservation failed:', e);
            try {
                await this.page?.evaluate(() => {
                    // @ts-ignore
                    $('.modal').modal('hide');
                });
            } catch { }
            return false;
        }
    }
    async registerReservation(data: ReservationData): Promise<boolean> {
        console.log(`[ErpService] registerReservation called for ${data.name} on ${data.date}`)

        const startTime = data.time
        const [h, m] = startTime.split(':').map(Number)
        const endH = h + data.duration
        const endTime = `${String(endH).padStart(2, '0')}:${String(m).padStart(2, '0')}`

        const createData = {
            name: data.name,
            memberType: 'existing',
            date: data.date,
            start_time: startTime,
            end_time: endTime,
            seat_id: '', // Let fallback handle it
            product: data.type,
            goods_idx: '',
            customerId: data.customerId,
            dryRun: false
        }

        return await this.createReservation(createData)
    }

    async getSchedule(startDate: string, endDate: string): Promise<any[]> {
        console.log(`[ErpService] getSchedule called from ${startDate} to ${endDate}`)
        if (!this.browser) await this.start()
        if (!this.page) return []
        const page = this.page

        try {
            // Ensure Calendar
            if (!page.url().includes('/index/calender')) {
                await this.login('dobong', '1010')
                await page.waitForTimeout(1000)
                if (!page.url().includes('/index/calender')) {
                    await page.goto('http://sook0517.cafe24.com/index/calender')
                }
            }

            // We need to fetch events for the range.
            // FullCalendar v3 (assumed) fetches based on view.
            // Strategy: Switch to 'month' view and navigate to each month in range.
            // But simpler: Use 'listYear' or similar if available, or just iterate months.
            // Let's try fetching clientEvents if they are already loaded? No, we need to ensure they are loaded.
            // Best way: Use 'gotoDate' to the start month, wait, then next month.

            const start = new Date(startDate)
            const end = new Date(endDate)
            const events: any[] = []

            // Iterate months
            let current = new Date(start)
            while (current <= end) {
                const dateStr = current.toISOString().split('T')[0]
                console.log(`[ErpService] Loading month for ${dateStr}`)

                await page.evaluate((d) => {
                    // @ts-ignore
                    $('#calendar').fullCalendar('changeView', 'month');
                    // @ts-ignore
                    $('#calendar').fullCalendar('gotoDate', d);
                }, dateStr)

                await page.waitForTimeout(1000) // Wait for AJAX

                // Extract events from memory
                const monthEvents = await page.evaluate(() => {
                    // @ts-ignore
                    const rawEvents = $('#calendar').fullCalendar('clientEvents');
                    return rawEvents.map((e: any) => ({
                        id: e.id,
                        title: e.title,
                        start: e.start ? e.start.format() : null,
                        end: e.end ? e.end.format() : null,
                        className: e.className
                    }));
                });

                events.push(...monthEvents)

                // Next month
                current.setMonth(current.getMonth() + 1)
            }

            // Deduplicate by ID
            const uniqueEvents = Array.from(new Map(events.map(item => [item.id, item])).values());
            console.log(`[ErpService] Fetched ${uniqueEvents.length} unique events`)

            return uniqueEvents

        } catch (e) {
            console.error('[ErpService] getSchedule error:', e)
            return []
        }
    }

    async searchCustomer(name: string): Promise<Customer[]> {
        console.log(`[ErpService] searchCustomer called with name: ${name}`)
        if (!this.page) await this.start()
        if (!this.page) return []

        const page = this.page

        try {
            // Ensure we are on the member list page
            if (!page.url().includes('/index/member')) {
                await page.goto('http://sook0517.cafe24.com/index/member/list', { waitUntil: 'domcontentloaded' })
            }

            // Fill search input
            await page.fill('#search_text', name)
            await page.click('#search_btn')

            // Wait for navigation or table update
            await page.waitForNavigation({ waitUntil: 'domcontentloaded' })

            // Parse results
            const customers: Customer[] = []
            const rows = page.locator('table.jambo_table tbody tr')
            const count = await rows.count()

            for (let i = 0; i < count; i++) {
                const row = rows.nth(i)
                const id = await row.locator('input[name="member_idx"]').getAttribute('value')
                // Name is in the second column, inside an <a> tag
                const nameText = await row.locator('td:nth-child(2) > a').first().textContent()
                const phone = await row.locator('td.phone_td').textContent()
                const goods = await row.locator('td:nth-child(5)').textContent()
                const remainingTime = await row.locator('td:nth-child(6)').textContent()
                const testDate = await row.locator('td:nth-child(7)').textContent()
                const finalPass = await row.locator('td:nth-child(8)').textContent()
                const branch = await row.locator('td:nth-child(9)').textContent()
                const joinDate = await row.locator('td:nth-child(11)').textContent()

                if (id && nameText) {
                    customers.push({
                        id,
                        name: nameText.trim(),
                        phone: phone?.trim() || '',
                        goods: goods?.trim(),
                        remainingTime: remainingTime?.trim(),
                        testDate: testDate?.trim(),
                        finalPass: finalPass?.trim(),
                        branch: branch?.trim(),
                        joinDate: joinDate?.trim()
                    })
                }
            }

            console.log(`[ErpService] Found ${customers.length} customers for name: ${name}`)
            return customers

        } catch (e) {
            console.error('[ErpService] Error in searchCustomer:', e)
            return []
        }
    }

    async getCustomerDetail(id: string): Promise<{ memo: string, history: string[] }> {
        console.log(`[ErpService] getCustomerDetail called for ID ${id}`)
        if (!this.page) return { memo: '', history: [] }
        const page = this.page

        // Check if we are on member list
        if (!page.url().includes('/index/member')) {
            console.warn('[ErpService] Not on member list page, cannot open modal directly.')
            return { memo: '', history: [] }
        }

        // Find row
        const row = page.locator(`tr:has(input[value="${id}"])`)
        if (await row.count() === 0) {
            console.error(`[ErpService] Customer row not found for ID ${id}`)
            return { memo: '', history: [] }
        }

        // Click name
        await row.locator('td:nth-child(2) > a').first().click()

        // Wait for modal
        const modalSelector = `#modifyModal_${id}`
        try {
            await page.waitForSelector(modalSelector, { state: 'visible', timeout: 5000 })
        } catch (e) {
            console.error(`[ErpService] Modal ${modalSelector} timeout`)
            return { memo: '', history: [] }
        }

        // Get Memo
        const memo = await page.locator(`${modalSelector} textarea[name="memo"]`).inputValue()

        // Get History
        const historyHtml = await page.locator(`${modalSelector} .booking_history`).innerHTML()
        const history = historyHtml.split('<br>').map(s => s.trim()).filter(s => s.length > 0)

        // Close
        await page.locator(`${modalSelector} button.close`).click()
        await page.waitForSelector(modalSelector, { state: 'hidden' })

        return { memo, history }
    }

    async checkDuplicate(customer: Customer, date: string): Promise<boolean> {
        // Returns true if duplicate found
        const detail = await this.getCustomerDetail(customer.id)
        // Check history for date
        // History format: "2025-12-18/13:00~14:00(목) 예약 하셨습니다."
        // We check if any line starts with the date
        const hasDuplicate = detail.history.some(line => line.startsWith(date))
        console.log(`[ErpService] checkDuplicate for ${customer.name} on ${date}: ${hasDuplicate}`)
        return hasDuplicate
    }

}

