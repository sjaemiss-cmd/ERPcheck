import { chromium, Browser, Page, BrowserContext } from 'playwright'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

export class ScraperService {
    private browser: Browser | null = null
    private context: BrowserContext | null = null
    private page: Page | null = null
    private cookiePath: string

    constructor() {
        // Safe path for cookies
        const userDataPath = app.getPath('userData')
        this.cookiePath = path.join(userDataPath, 'naver_cookies.json')
    }

    private async loadSession() {
        if (!this.context) return
        try {
            if (fs.existsSync(this.cookiePath)) {
                const cookies = JSON.parse(fs.readFileSync(this.cookiePath, 'utf-8'))
                await this.context.addCookies(cookies)
                console.log(`[ScraperService] Loaded ${cookies.length} cookies from ${this.cookiePath}`)
            }
        } catch (e) {
            console.error('[ScraperService] Error loading session:', e)
        }
    }

    private async saveSession() {
        if (!this.context) return
        try {
            const cookies = await this.context.cookies()
            fs.writeFileSync(this.cookiePath, JSON.stringify(cookies, null, 2))
            console.log(`[ScraperService] Saved ${cookies.length} cookies to ${this.cookiePath}`)
        } catch (e) {
            console.error('[ScraperService] Error saving session:', e)
        }
    }

    async start() {
        if (this.browser && !this.browser.isConnected()) {
            this.browser = null
            this.context = null
            this.page = null
        }
        if (this.page && this.page.isClosed()) {
            this.page = null
        }

        if (!this.browser) {
            this.browser = await chromium.launch({ headless: false })
            this.context = await this.browser.newContext({
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })

            await this.loadSession() // Inject cookies

            this.browser.on('disconnected', () => {
                console.log('[ScraperService] Browser disconnected')
                this.browser = null
                this.context = null
                this.page = null
            })
            this.page = await this.context.newPage()
        } else if (!this.page) {
            if (!this.context) this.context = await this.browser.newContext()
            this.page = await this.context.newPage()
        }
    }

    async naverLogin(): Promise<boolean> {
        try {
            await this.start()
            if (!this.page) return false

            const page = this.page

            // 1. Check if already logged in by visiting the target page first
            const targetUrl = 'https://partner.booking.naver.com/bizes/213948/booking-list-view';
            console.log('[ScraperService] Checking existing login session...');
            await page.goto(targetUrl);
            await page.waitForTimeout(1000);

            if (!page.url().includes('nid.naver.com')) {
                console.log('[ScraperService] Already logged in!');
                return true;
            }

            // 2. If redirected to login, proceed with manual login
            console.log('[ScraperService] Session expired. Redirecting to login...');
            await page.goto('https://nid.naver.com/nidlogin.login');
            console.log('[ScraperService] Please login to Naver manually...');

            // Wait for navigation away from login page to confirm success
            await page.waitForURL((url) => {
                const href = url.toString()
                return !href.includes('nidlogin') && (href.includes('partner.booking.naver.com') || href.includes('naver.com'))
            }, { timeout: 120000 }) // 2 mins

            console.log('[ScraperService] Login detected, saving session...')
            await this.saveSession()

            return true
        } catch (e) {
            console.error('[ScraperService] Naver login timeout or error:', e)
            return false
        }
    }

    async kakaoLogin(): Promise<boolean> {
        try {
            await this.start()
            if (!this.page) return false

            await this.page.goto('https://accounts.kakao.com/login')
            console.log('[ScraperService] Please login to Kakao manually...')
            return true
        } catch (e) {
            console.error('[ScraperService] Kakao login error:', e)
            return false
        }
    }

    async scrapeNaverReservations(): Promise<any[]> {
        console.log('[ScraperService] scrapeNaverReservations called')
        try {
            await this.start()
            if (!this.page) return []

            const page = this.page
            // 1. Go to List
            await page.goto('https://partner.booking.naver.com/bizes/697059/booking-list-view', { waitUntil: 'domcontentloaded' })

            // Check if login is needed
            if (page.url().includes('nidlogin') || page.url().includes('login')) {
                console.warn('[ScraperService] Not logged in. Please run naverLogin first.')
                return []
            }

            // Wait for list to load - Wait for the actual rows/links, not just the container
            try {
                await page.waitForSelector("a[class*='BookingListView__contents-user']", { timeout: 10000 })
                // Small extra wait for all items to render
                await page.waitForTimeout(1000)
            } catch (e) {
                console.warn('[ScraperService] No booking links found within timeout. Page might be empty or loading slow.')
                // Check if there's a "no data" message
                const noData = await page.isVisible("div[class*='BookingListView__no-data']").catch(() => false)
                if (noData) {
                    console.log('[ScraperService] Confirmed: No bookings available.')
                }
                return []
            }

            const results: any[] = []

            // 2. Iterate Strategy: Count links directly
            const rowsLocator = page.locator("a[class*='BookingListView__contents-user']")
            const rowCount = await rowsLocator.count()
            console.log(`[ScraperService] Found ${rowCount} bookings in list`)

            for (let i = 0; i < rowCount; i++) {
                try {
                    // Re-query list item to avoid stale elements
                    const row = rowsLocator.nth(i)
                    const rowText = await row.innerText().catch(() => '')

                    // Skip only if it's explicitly 'Usage Completed' or 'Cancelled'
                    // Avoid skipping 'Payment Completed' (결제완료) which is an active booking
                    if (rowText.includes('이용완료') || rowText.includes('취소')) {
                        console.log(`[ScraperService] Skipping row ${i}: ${rowText.split('\n')[0]}...`)
                        continue
                    }

                    // 3. Click Detail
                    await row.click()

                    // 4. Wait for Detail View
                    await page.waitForSelector("div[class*='Detail__body-container']", { timeout: 5000 })

                    // 5. Scrape Detail Data (Standard DOM API Only)
                    const detail = await page.evaluate(() => {
                        const getText = (root: Element | Document, selector: string) => {
                            const el = root.querySelector(selector)
                            return el ? (el as HTMLElement).innerText.trim() : ''
                        }

                        // A. User Name
                        const userName = getText(document, "span[class*='Summary__name__']")

                        // B. User Phone
                        // Find <a href="tel:...">
                        const phoneEl = document.querySelector("a[href^='tel:']")
                        const userPhone = phoneEl ? (phoneEl as HTMLElement).innerText.trim() : ''

                        // C. Items Iteration (Date, Product, BookingNo, Options)
                        // Iterate through all Summary items to find labels
                        const items = Array.from(document.querySelectorAll('.Summary__item__MAL-w, .Summary__item__eiRCE'))

                        let dateStr = ''
                        let product = ''
                        let options = ''
                        let bookingNo = ''

                        items.forEach(div => {
                            const titleEl = div.querySelector("[class*='title']")
                            const descEl = div.querySelector("[class*='dsc']")

                            if (titleEl && descEl) {
                                const title = (titleEl as HTMLElement).innerText // "이용일시", "상품", "예약번호"
                                const desc = (descEl as HTMLElement).innerText

                                if (title.includes('이용일시')) dateStr = desc
                                if (title.includes('상품')) product = desc
                                if (title.includes('옵션')) options = desc
                                if (title.includes('예약번호')) bookingNo = desc
                            }
                        })

                        // D. Status
                        const status = getText(document, "span[data-tst_booking_status='0']") // Header status

                        return {
                            user_name: userName,
                            user_phone: userPhone,
                            booking_no: bookingNo,
                            date_string: dateStr,
                            product: product,
                            options: options,
                            status: status
                        }
                    })

                    // Parse Date/Time (Backend Logic)
                    // Convert "2025. 12. 18.(목) 오전 11:30" -> ISO or usable format
                    const simpleDate = detail.date_string.replace(/(\d{4})\. (\d{1,2})\. (\d{1,2}).*/, '$1-$2-$3')

                    results.push({
                        ...detail,
                        date: simpleDate,
                        source: 'Naver'
                    })

                    console.log(`[ScraperService] Scraped: ${detail.user_name} (${detail.date_string})`)

                    // 6. Go Back to List
                    await page.goBack()

                    // Wait for List again before next iteration
                    await page.waitForSelector("div[class*='BookingListView__list-contents']", { timeout: 5000 })

                } catch (e) {
                    console.error(`[ScraperService] Error scraping row ${i}:`, e)
                    // Try to recover: If stuck on detail, go back. If on list, continue.
                    if (page.url().includes('booking-list-view/users')) {
                        await page.goBack().catch(() => { })
                        await page.waitForSelector("div[class*='BookingListView__list-contents']", { timeout: 5000 }).catch(() => { })
                    }
                }
            }

            return results

        } catch (e) {
            console.error('[ScraperService] Error in scrapeNaverReservations:', e)
            return []
        }
    }
}
