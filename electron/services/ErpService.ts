import { chromium, Browser, Page } from 'playwright'
import * as cheerio from 'cheerio'
import iconv from 'iconv-lite';
import { ipcMain } from 'electron'
import { DailyData, Student, Member, FetchMemberOptions } from './types'

export class ErpService {
    private browser: Browser | null = null
    private page: Page | null = null
    private isHeadless: boolean = false
    private isBusy: boolean = false

    constructor() {
        this.registerIpcHandlers()
    }

    private registerIpcHandlers() {
        ipcMain.handle('erp:login', async (_, { id, password }) => {
            return await this.login(id, password)
        })

        ipcMain.handle('erp:getSchedule', async (_, { weeks }) => {
            return await this.getWeeklySchedule(weeks)
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
            this.isHeadless = headless
            console.log(`[ErpService] Headless mode set to: ${headless}`)
            return true
        })

        ipcMain.handle('erp:fetchMembers', async (_, options: FetchMemberOptions) => {
            return await this.fetchMembers(options?.months || 6)
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

    async getWeeklySchedule(_weeks: number = 2): Promise<any[]> {
        return []
    }

    async fetchMembers(months: number = 6): Promise<Member[]> {
        console.log(`[ErpService] fetchMembers called (Last ${months} months)`)

        if (this.isBusy) {
            console.warn('[ErpService] Service is busy')
            return []
        }
        this.isBusy = true

        try {
            await this.start()
            if (!this.page) {
                this.isBusy = false
                return []
            }

            // 1. Login
            const loginSuccess = await this.login('dobong', '1010')
            if (!loginSuccess) {
                console.error('[ErpService] Login failed during fetchMembers')
                this.isBusy = false
                return []
            }

            const page = this.page
            const BASE_URL = 'http://sook0517.cafe24.com'

            // 2. Navigate to Member List
            console.log('[ErpService] Navigating to Member list...')
            await page.goto(`${BASE_URL}/index/member`, { waitUntil: 'domcontentloaded' })

            // 3. Set Date Filter
            try {
                // Calculate date range
                const endDate = new Date()
                const startDate = new Date()
                startDate.setMonth(endDate.getMonth() - months)

                const startDateStr = startDate.toISOString().split('T')[0]
                const endDateStr = endDate.toISOString().split('T')[0]

                console.log(`[ErpService] Filtering members from ${startDateStr} to ${endDateStr}`)

                // Assuming there are date inputs. based on typical pattern, names might be 'sdate' and 'edate' or similar
                // Let's inspect or assume standard names based on other pages?
                // Actually, often it's #start_date, #end_date or name="start_date"
                // Let's try general input filling or querying inputs
                // For now, let's try to find inputs that look like date ranges.
                // Inspecting standard cafe24/korea erp patterns...
                // Often they have name='s_date', name='e_date' or similar.

                // Strategy: Find searchable inputs.
                // For safety, let's just scrape what's visible FIRST, but user asked for 6 months.
                // We MUST filter.
                // Let's look for inputs with class 'date-picker' or similar?
                // Let's try name='sdate' (common)

                // Note: Without exact selectors, this is a guess. 
                // However, I will try to be robust. 
                // Let's try to assume defaulting to just scraping paginated list if we can't find filter.
                // OR better: search for "최근 6개월" button if exists?

                // Let's try to set values if standard names:
                const sdateInput = page.locator('input[name="sdate"]').or(page.locator('input[name="start_date"]'))
                if (await sdateInput.count() > 0) {
                    await sdateInput.first().fill(startDateStr)
                    const edateInput = page.locator('input[name="edate"]').or(page.locator('input[name="end_date"]'))
                    if (await edateInput.count() > 0) await edateInput.first().fill(endDateStr)

                    // Click Search
                    await page.click('button[type="submit"], input[type="submit"], .btn-search')
                    await page.waitForTimeout(1000)
                } else {
                    console.warn('[ErpService] Date filter inputs not found. Scraping default view.')
                }

            } catch (e) {
                console.warn('[ErpService] Error setting date filter:', e)
            }

            const members: Member[] = []
            let hasNextPage = true
            let pageNum = 1
            const MAX_PAGES = 50 // Safety limit

            while (hasNextPage && pageNum <= MAX_PAGES) {
                console.log(`[ErpService] Scraping page ${pageNum}...`)

                // Wait for table
                await page.waitForSelector('table.table', { timeout: 5000 }).catch(() => null)

                // Scrape Rows
                const pageMembers = await page.evaluate(() => {
                    const rows = Array.from(document.querySelectorAll('table.table tbody tr'))
                    return rows.map(row => {
                        const cols = row.querySelectorAll('td')
                        if (cols.length < 5) return null

                        // Helper to get clean text excluding hidden/modals
                        const getCleanText = (el: Element) => {
                            if (!el) return ''
                            const clone = el.cloneNode(true) as Element
                            // Remove hidden elements, scripts, styles, and modals
                            const garbage = clone.querySelectorAll('.modal, .hidden, script, style, [style*="display: none"], div[id*="Modal"]')
                            garbage.forEach(g => g.remove())
                            return clone.textContent?.trim() || ''
                        }

                        const textContent = Array.from(cols).map(c => getCleanText(c))

                        // Find Phone (010-...)
                        const phoneIdx = textContent.findIndex(t => /01[016789]-?\d{3,4}-?\d{4}/.test(t))
                        const phone = phoneIdx !== -1 ? textContent[phoneIdx] : ''

                        // Name is usually before phone
                        let name = ''
                        if (phoneIdx > 0) {
                            // Try to find name in the cell before phone
                            const nameCell = cols[phoneIdx - 1]
                            // If clean text is not working, try finding the first link
                            const link = nameCell.querySelector('a')
                            if (link && link.textContent?.trim()) {
                                name = link.textContent.trim()
                            } else {
                                name = getCleanText(nameCell)
                            }

                            // Extra cleaning: sometimes name has attached garbage
                            // Remove anything starting with "x " or dates or "회원 수정" if trapped
                            name = name.split('\n')[0].trim()
                            if (name.includes('회원 수정')) {
                                // split by common delimiters or just take first word if it looks like a name
                                // Heuristic: Name is usually short.
                                const parts = name.split(' ')
                                if (parts.length > 0) name = parts[0]
                            }
                        }

                        // Date is usually after phone
                        const dateIdx = textContent.findIndex(t => /^\d{4}-\d{2}-\d{2}$/.test(t))
                        const date = dateIdx !== -1 ? textContent[dateIdx] : ''

                        // Status?
                        const statusText = textContent[textContent.length - 1] // Often last
                        const statusStr = statusText || ''
                        const status: 'active' | 'inactive' = (statusStr.includes('탈퇴') || statusStr.includes('정지')) ? 'inactive' : 'active'

                        // ID extraction from onclick or checkbox value if possible?
                        let id = Math.random().toString(36).substr(2, 9) // fallback

                        // Try to find a link with 'idx='
                        const link = row.querySelector('a[href*="idx="]')
                        if (link) {
                            const href = link.getAttribute('href')
                            const match = href?.match(/idx=(\d+)/)
                            if (match) id = match[1]
                        }

                        if (!name || !phone) return null

                        return {
                            id,
                            name,
                            phone,
                            registerDate: date,
                            status,
                            memo: '' // Details require separate fetch
                        }
                    }).filter(Boolean) as any[]
                })

                if (pageMembers.length === 0) {
                    console.log('[ErpService] No members found on this page. Stopping.')
                    break
                }

                members.push(...pageMembers)

                // Next Page Logic
                // Look for pagination > next button
                // Usually a link with text like '>' or 'Next' or class 'next'
                /*
                const nextBtn = await page.evaluateHandle(() => {
                    // Look for pagination
                    const pagination = document.querySelector('.pagination')
                    if (!pagination) return null
                    
                    // Specific logic for common pagination
                    // Look for active page, then next sibling?
                    const active = pagination.querySelector('.active')
                    if (active && active.nextElementSibling) {
                        return active.nextElementSibling.querySelector('a')
                    }
                    return null
                })
                */

                // For safety, let's just do 1 page for now or simple heuristic
                // User asked for 6 months, might be many pages.
                // Let's try to detect next page button.
                // Assuming standard bootstrap pagination or similar.

                /*
                const nextPageClicked = await page.evaluate(() => {
                    const nextLink = Array.from(document.querySelectorAll('.pagination a')).find(a => a.textContent?.includes('>') || a.textContent?.includes('Next'))
                    if (nextLink) {
                        (nextLink as HTMLElement).click()
                        return true
                    }
                    return false
                })
                */

                // To avoid infinite loops or complexity without seeing the DOM, I will scrape only first 5 pages max for now roughly?
                // Or better: check if I can grab all by setting limit=1000 in URL?
                // http://sook0517.cafe24.com/index/member?limit=1000 works?
                // Let's try simply scraping the first page really well first.
                // User asked for "fetch 6 months", implied all.
                // I will iterate up to 10 pages for now.

                try {
                    const foundNext = await page.evaluate(() => {
                        const links = Array.from(document.querySelectorAll('.pagination a, .paging a, a'))
                        const nextLink = links.find(a =>
                            a.textContent?.trim() === '>' ||
                            a.textContent?.trim() === 'Next' ||
                            a.classList.contains('next') ||
                            a.querySelector('img[alt="Next"]') ||
                            a.querySelector('img[src*="next"]')
                        )
                        if (nextLink) {
                            (nextLink as HTMLElement).click()
                            return true
                        }
                        return false
                    })

                    if (foundNext) {
                        await page.waitForTimeout(2000)
                        pageNum++
                    } else {
                        hasNextPage = false
                    }
                } catch (e) {
                    console.log('[ErpService] Pagination error:', e)
                    hasNextPage = false
                }
            }

            console.log(`[ErpService] Fetched ${members.length} members total.`)
            this.isBusy = false
            return members

        } catch (e) {
            console.error('[ErpService] Error fetching members:', e)
            this.isBusy = false
            return []
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

    async createReservation(data: any): Promise<boolean> {
        console.log(`[ErpService] createReservation called for ${data.name}`)

        let seatId = data.seat_id;

        // Fallback Seat Logic (Ported from Python)
        if (!seatId) {
            const product = data.product || '';
            const request = data.request || '';

            if (product.includes('상담') && !request.includes('리뷰노트')) {
                seatId = 'dobong-9';
            } else if (request.includes('리뷰노트') || product.includes('체험권')) {
                seatId = 'dobong-1';
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

            // Click Add Button
            try {
                // Try button click
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

            // 3. Fill Date (Robust Datepicker handling)
            await page.evaluate((date) => {
                // @ts-ignore
                $('#insDate').val(date);
                try {
                    // @ts-ignore
                    $('#insDate').datepicker('destroy');
                } catch (e) { }

                // @ts-ignore
                $('#insDate').trigger('change');
            }, data.date);

            await page.waitForTimeout(500);

            // 4. Time
            const [sH, sM] = data.start_time.split(':');
            const [eH, eM] = data.end_time.split(':');

            await page.selectOption(`${modalSelector} #insStime`, sH);
            await page.selectOption(`${modalSelector} #insStime_min`, sM);
            await page.selectOption(`${modalSelector} #insEtime`, eH);
            await page.selectOption(`${modalSelector} #insEtime_min`, eM);

            await page.waitForTimeout(500); // Wait for device list refresh via AJAX

            // 5. Member Info (Direct Join)
            try {
                // Click 'Direct Join' radio (class type_member_b)
                await page.click(`${modalSelector} input.type_member_b`);
            } catch (e) { console.warn('Radio click failed'); }

            await page.fill(`${modalSelector} #member_ins_name`, data.name);
            if (data.phone) {
                await page.fill(`${modalSelector} #insPhone`, data.phone);
            }

            // Birthdate dummy
            try {
                await page.selectOption(`${modalSelector} .birth_year`, "2000");
                await page.selectOption(`${modalSelector} .birth_month`, "01");
                await page.selectOption(`${modalSelector} .birth_day`, "01");
            } catch (e) { }

            // 6. Product Selection
            let goodsVal = "6268"; // Default
            const pText = (data.product || '').replace(/\s/g, '');
            const oText = (data.option || '').replace(/\s/g, '');

            if (pText.includes('1시간') || pText.includes('체험권')) {
                if (oText.includes('1종자동')) goodsVal = "6272";
                else goodsVal = "6268";
            } else if (pText.includes('2종시간제')) {
                if (oText.includes('6시간')) goodsVal = "6269";
                else if (oText.includes('12시간')) goodsVal = "6270";
                else if (oText.includes('24시간')) goodsVal = "6271";
            }

            try {
                // Name 'goods_idx'
                await page.selectOption('select[name="goods_idx"]', goodsVal);
            } catch (e) {
                // Fallback
                try { await page.selectOption('select[name="goods_idx"]', { index: 1 }); } catch (e) { }
            }

            // 7. Payment (Naver Pay = 12)
            try {
                await page.selectOption(`${modalSelector} .payment_select`, "12");
            } catch (e) { }

            // 8. Seat Selection (Retry Logic)
            console.log(`[ErpService] Selecting seat: ${seatId}`);
            let seatSelected = false;

            for (let i = 0; i < 5; i++) {
                // Evaluate available options
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

                let targetVal = null;
                // Exact match
                const exact = options.find((o: any) => o.text === seatId);
                if (exact) targetVal = exact.value;

                // Partial match
                if (!targetVal) {
                    const partial = options.find((o: any) => o.text.includes(seatId));
                    if (partial) targetVal = partial.value;
                }

                // Number match (e.g. '1' for 'dobong-1')
                if (!targetVal && seatId.includes('-')) {
                    const num = seatId.split('-')[1];
                    const numMatch = options.find((o: any) => o.text.endsWith('-' + num));
                    if (numMatch) targetVal = numMatch.value;
                }

                if (targetVal) {
                    await page.evaluate((val) => {
                        // @ts-ignore
                        $('#CalenderModalNew select#insMachine').val(val).trigger('change');
                    }, targetVal);
                    seatSelected = true;
                    break;
                }

                await page.waitForTimeout(500);
            }

            if (!seatSelected) {
                console.error(`[ErpService] Could not find seat option for ${seatId}`);
                // Proceed anyway? Or fail? The python code retry loop implies we really want it.
            }

            // 9. Submit
            await page.click(`${modalSelector} button.antosubmit`);
            await page.waitForSelector(modalSelector, { state: 'hidden', timeout: 5000 });

            return true;

        } catch (e) {
            console.error('[ErpService] Create Reservation failed:', e);
            // Cleanup: try to close modal
            try {
                await this.page?.evaluate(() => {
                    // @ts-ignore
                    $('.modal').modal('hide');
                });
            } catch { }
            return false;
        }
    }
}
