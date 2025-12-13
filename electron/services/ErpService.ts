import { chromium, Browser, Page } from 'playwright'
import { ipcMain } from 'electron'
import { DailyData, Student } from './types'

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
        ipcMain.handle('erp:updateMemo', async (_, { id, memo, name, time }) => {
            return await this.updateMemo(id, memo, name, time)
        })

        ipcMain.handle('erp:writeMemosBatch', async (_, { memoList }) => {
            return await this.writeMemosBatch(memoList)
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
            this.isHeadless = false
            await this.start()

            if (!this.page) {
                console.error('[ErpService] Page not initialized')
                return false
            }
            const page = this.page

            // OPTIMIZATION: Check URL before navigating
            if (page.url().includes('/index/calender') || page.url().includes('/index/main')) {
                console.log('[ErpService] Already logged in (URL check)')
                return true
            }

            await page.goto('https://sook0517.cafe24.com/', { waitUntil: 'domcontentloaded' })

            if (page.url().includes('/index/calender') || page.url().includes('/index/main')) {
                console.log('[ErpService] Already logged in')
                return true
            }

            try {
                await page.waitForSelector('input[name="id"]', { state: 'visible', timeout: 5000 })
                await page.fill('input[name="id"]', id)
            } catch (e) {
                console.error('[ErpService] ID input not found')
                return false
            }

            try {
                const pwdInput = page.locator('input[name="pwd"]').or(page.locator('input[type="password"]')).first()
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

            await page.click('button[type="submit"]')

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

    async getTodayEducation(): Promise<DailyData> {
        console.log('[ErpService] getTodayEducation called')
        if (this.isBusy) {
            return { operationTime: '', students: [] }
        }
        this.isBusy = true

        try {
            await this.start()
            if (!this.page || this.page.isClosed()) {
                this.isBusy = false
                return { operationTime: '', students: [] }
            }
            const page = this.page

            if (!page.url().includes('/index/calender')) {
                await page.goto('https://sook0517.cafe24.com/index/calender', { waitUntil: 'domcontentloaded' })
                await page.waitForTimeout(1000)
            }

            // FullCalendar API를 통해 이벤트 데이터 추출
            const eventsData = await page.evaluate(() => {
                // @ts-ignore
                const $ = window.$;
                if (!$) return [];

                let cal = $('#calendar');
                if (cal.length === 0) cal = $('.fc').parent();

                if (cal.length > 0 && cal.fullCalendar) {
                    // @ts-ignore
                    const events = cal.fullCalendar('clientEvents');
                    // @ts-ignore
                    return events.map((e: any) => ({
                        id: e._id || e.id,
                        title: e.title,
                        start: e.start ? e.start.format() : null,
                        end: e.end ? e.end.format() : null,
                        className: e.className
                    }));
                }
                return [];
            });

            console.log(`[ErpService] Raw JS Events found: ${eventsData.length}`);

            const todayStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
            // @ts-ignore
            const todayEvents = eventsData.filter((e: any) => e.start && e.start.startsWith(todayStr));

            // 시작 시간순 정렬
            // @ts-ignore
            todayEvents.sort((a: any, b: any) => (a.start || '').localeCompare(b.start || ''));

            console.log(`[ErpService] Filtered Today's Events: ${todayEvents.length}`);

            const result: DailyData = { operationTime: '', students: [] }

            // @ts-ignore
            for (let i = 0; i < todayEvents.length; i++) {
                const e = todayEvents[i];
                const title = e.title || '';

                // 1. Operation Time Check
                if (title.includes('운영')) {
                    if (e.start && e.end) {
                        const sTime = e.start.substring(11, 16); // HH:MM
                        const eTime = e.end.substring(11, 16);
                        result.operationTime = `${sTime} ~ ${eTime}`;
                    } else {
                        result.operationTime = title;
                    }
                    continue;
                }

                // 2. Name Parsing
                let cleanTitle = title.replace(/\n/g, ' ').trim();
                const tagsToRemove = ["[시간제]", "[미납]", "[보강]", "[예약]", "운영"];
                tagsToRemove.forEach(tag => {
                    cleanTitle = cleanTitle.split(tag).join('');
                });
                cleanTitle = cleanTitle.replace(/\d{1,2}:\d{2}\s*[-~]?\s*(\d{1,2}:\d{2})?/g, '').trim();

                let name = '';
                const parts = cleanTitle.split(/\s+/);
                if (parts.length > 0) {
                    name = parts[0];
                    if (name.includes('/')) {
                        name = name.split('/')[0];
                    }
                }

                if (!name) continue;

                // 3. Duration Calculation
                let duration = 1.0;
                if (e.start && e.end) {
                    const start = new Date(e.start);
                    const end = new Date(e.end);
                    const diffMs = end.getTime() - start.getTime();
                    duration = diffMs / (1000 * 60 * 60); // 시간 단위
                }
                duration = Math.round(duration * 10) / 10;

                const timeStr = e.start ? e.start.substring(11, 16) : '';

                // 4. 상세 정보 수집 (모달 열기)
                let history: { date: string; content: string }[] = []
                let generalMemo = ''
                let photo = ''

                try {
                    // DOM 요소 찾기 (이름과 시간으로 매칭)
                    const eventLocator = page.locator('.fc-event', { hasText: name }).filter({ hasText: timeStr }).first();

                    if (await eventLocator.count() > 0) {
                        await eventLocator.click({ force: true });

                        // 모달 대기
                        let modalVisible = false
                        for (let attempt = 0; attempt < 3; attempt++) {
                            try {
                                await page.waitForSelector('#modifyMemberModal', { state: 'visible', timeout: 2000 })
                                modalVisible = true
                                break
                            } catch (waitErr) {
                                try {
                                    if (await page.locator('#CalenderModalEdit').isVisible()) {
                                        await page.evaluate(() => {
                                            // @ts-ignore
                                            if (typeof window.modMemberView === 'function') window.modMemberView()
                                        })
                                    }
                                } catch (e) { }
                                await page.waitForTimeout(500)
                            }
                        }

                        if (modalVisible) {
                            const scrapedData = await page.evaluate(() => {
                                const modal = document.querySelector('#modifyMemberModal')
                                if (!modal) return { memo: '', history: [], photo: '' }

                                const memoEl = modal.querySelector("textarea[name='memo']") as HTMLTextAreaElement
                                const memo = memoEl ? memoEl.value : ''

                                const historyList: { date: string; content: string }[] = []
                                const rows = modal.querySelectorAll('.form-inline')
                                rows.forEach(row => {
                                    const dateInput = row.querySelector("input[name='date[]']") as HTMLInputElement
                                    const textInput = row.querySelector("input[name='comment[]']") as HTMLInputElement
                                    if (dateInput && textInput && dateInput.value && textInput.value) {
                                        historyList.push({ date: dateInput.value, content: textInput.value })
                                    }
                                })

                                const img = modal.querySelector('img#photo_image') as HTMLImageElement
                                const photoData = img ? img.src : ''

                                return { memo, history: historyList, photo: photoData }
                            })

                            generalMemo = scrapedData.memo
                            history = scrapedData.history
                            photo = scrapedData.photo

                            await page.evaluate(() => {
                                // @ts-ignore
                                $('#modifyMemberModal').modal('hide')
                                // @ts-ignore
                                $('#CalenderModalEdit').modal('hide')
                                // @ts-ignore
                                $('.modal').modal('hide')
                            })
                            await page.waitForTimeout(300)
                        }
                    }
                } catch (err) {
                    console.error(`[ErpService] Error fetching details for ${name}:`, err)
                    try {
                        await page.evaluate(() => {
                            // @ts-ignore
                            $('.modal').modal('hide')
                        })
                    } catch (e) { }
                }

                const student: Student = {
                    id: String(i),
                    name: name,
                    time: timeStr,
                    duration: duration,
                    status: 'pending',
                    type: '기타',
                    history: history,
                    generalMemo: generalMemo,
                    photo: photo,
                    index: i
                }
                result.students.push(student)
            }

            console.log('[ErpService] Closing browser...')
            await this.browser?.close()
            this.browser = null
            this.page = null
            this.isBusy = false

            return result

        } catch (e) {
            console.error('[ErpService] Error in getTodayEducation:', e)
            if (this.browser) {
                await this.browser.close().catch(() => { })
                this.browser = null
                this.page = null
            }
            this.isBusy = false
            return { operationTime: '', students: [] }
        }
    }

    async getStudentDetail(_id: string): Promise<{ generalMemo: string; history: any[] }> {
        return { generalMemo: '', history: [] }
    }

    // New helper method for core memo logic
    private async _updateMemoCore(name: string, time: string, memo: string): Promise<boolean> {
        if (!this.page) return false
        const page = this.page

        try {
            // Find event by Name and Time
            const eventLocator = page.locator('.fc-event', { hasText: name }).filter({ hasText: time }).first()

            if (await eventLocator.count() === 0) {
                console.error(`[ErpService] Event not found for ${name} at ${time}`)
                return false
            }

            // Click event
            await eventLocator.click({ force: true })

            // Wait for modal and open member modify
            let modalVisible = false
            for (let attempt = 0; attempt < 3; attempt++) {
                try {
                    await page.waitForSelector('#modifyMemberModal', { state: 'visible', timeout: 2000 })
                    modalVisible = true
                    break
                } catch (waitErr) {
                    try {
                        if (await page.locator('#CalenderModalEdit').isVisible()) {
                            await page.evaluate(() => {
                                // @ts-ignore
                                if (typeof window.modMemberView === 'function') window.modMemberView()
                            })
                        }
                    } catch (e) { }
                    await page.waitForTimeout(500)
                }
            }

            if (!modalVisible) {
                console.error('[ErpService] Member modal not opening')
                // Close any open modals
                await page.evaluate(() => {
                    // @ts-ignore
                    $('.modal').modal('hide')
                })
                return false
            }

            // Add Memo Logic
            // 1. Click '+' button
            const plusBtn = page.locator('#modifyMemberModal .comment_btn .plus')
            if (await plusBtn.count() > 0) {
                await plusBtn.click()
                await page.waitForTimeout(500)
            } else {
                console.error('[ErpService] Plus button not found')
            }

            // 2. Fill Date and Memo
            const todayStr = new Date().toISOString().split('T')[0]

            // Find the last inputs (newly added row)
            const dateInputs = page.locator("#modifyMemberModal input[name='date[]']")
            const commentInputs = page.locator("#modifyMemberModal input[name='comment[]']")

            if (await dateInputs.count() > 0) {
                const lastDateInput = dateInputs.last()
                const lastCommentInput = commentInputs.last()

                // Robust Date Filling
                await lastDateInput.click()
                await lastDateInput.fill(todayStr)
                await lastDateInput.press('Enter')
                await lastDateInput.press('Tab')

                // Explicitly dispatch events to ensure validation passes
                await lastDateInput.evaluate((el) => {
                    el.dispatchEvent(new Event('change', { bubbles: true }))
                    el.dispatchEvent(new Event('blur', { bubbles: true }))
                })

                await page.waitForTimeout(500)

                // Robust Comment Filling
                await lastCommentInput.click()
                await lastCommentInput.fill(memo)
                await lastCommentInput.press('Tab') // Ensure blur
            }

            // 3. Click Save
            // Try finding '수정' or '저장' button
            const saveBtn = page.locator("#modifyMemberModal button:has-text('수정')").or(page.locator("#modifyMemberModal button:has-text('저장')")).first()

            if (await saveBtn.count() > 0) {
                // Handle alert
                page.once('dialog', dialog => dialog.accept())
                await saveBtn.click()
                await page.waitForTimeout(1000) // Wait for save
            } else {
                console.error('[ErpService] Save button not found')
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
            console.error('[ErpService] Error in _updateMemoCore:', e)
            // Cleanup
            try {
                await this.page?.evaluate(() => {
                    // @ts-ignore
                    $('.modal').modal('hide')
                })
            } catch { }
            return false
        }
    }

    // Updated updateMemo to use name and time for matching
    async updateMemo(_id: string, memo: string, name?: string, time?: string): Promise<boolean> {
        console.log(`[ErpService] updateMemo called for ${name} at ${time} with memo: ${memo}`)

        if (!name || !time) {
            console.error('[ErpService] Name or Time missing for updateMemo')
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
                await this.page.goto('https://sook0517.cafe24.com/index/calender', { waitUntil: 'domcontentloaded' })
            }

            const success = await this._updateMemoCore(name, time, memo)

            this.isBusy = false
            return success

        } catch (e) {
            console.error('[ErpService] Error in updateMemo:', e)
            this.isBusy = false
            return false
        }
    }

    async writeMemosBatch(memoList: { index: number; text: string; name: string; time: string }[]): Promise<Record<number, boolean>> {
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
                await this.page.goto('https://sook0517.cafe24.com/index/calender', { waitUntil: 'domcontentloaded' })
            }

            // 3. Loop
            for (const item of memoList) {
                console.log(`[ErpService] Batch processing: ${item.name} (${item.time})`)
                const success = await this._updateMemoCore(item.name, item.time, item.text)
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

    async createReservation(_data: any): Promise<boolean> {
        return true
    }
}
