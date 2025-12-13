import { chromium, Browser, Page } from 'playwright'

export class ScraperService {
    private browser: Browser | null = null
    private page: Page | null = null

    async naverLogin(): Promise<boolean> {
        try {
            if (!this.browser) {
                this.browser = await chromium.launch({ headless: false })
                this.page = await this.browser.newPage()
            }
            // Navigate to Naver login
            await this.page!.goto('https://nid.naver.com/nidlogin.login')
            // Wait for manual login
            console.log('[ScraperService] Please login to Naver manually...')
            return true
        } catch (e) {
            console.error('[ScraperService] Naver login error:', e)
            return false
        }
    }

    async kakaoLogin(): Promise<boolean> {
        try {
            if (!this.browser) {
                this.browser = await chromium.launch({ headless: false })
                this.page = await this.browser.newPage()
            }
            await this.page!.goto('https://accounts.kakao.com/login')
            console.log('[ScraperService] Please login to Kakao manually...')
            return true
        } catch (e) {
            console.error('[ScraperService] Kakao login error:', e)
            return false
        }
    }

    async getNaverBookings(): Promise<any[]> {
        console.log('[ScraperService] getNaverBookings called')
        try {
            if (!this.browser) {
                // If browser not open, launch it (user should have logged in previously or will login now)
                // But generally users click 'Login' first.
                this.browser = await chromium.launch({ headless: false })
                this.page = await this.browser.newPage()
            }
            if (!this.page) return []

            const page = this.page
            await page.goto('https://partner.booking.naver.com/bizes/697059/booking-list-view', { waitUntil: 'domcontentloaded' })

            // Wait for list
            try {
                await page.waitForSelector("div[class*='BookingListView__list-contents']", { timeout: 10000 })
            } catch (e) {
                console.error('[ScraperService] List container not found')
                return []
            }

            // Scrape Rows
            const bookings = await page.evaluate(() => {
                const results: any[] = []
                const rows = document.querySelectorAll("div[class*='BookingListView__name__']")

                rows.forEach((nameCell: any) => {
                    try {
                        // Go up to row
                        // DOM structure assumption: NameCell -> Parent (Row)
                        const row = nameCell.parentElement
                        if (!row) return

                        const name = nameCell.innerText.trim()

                        // Status
                        const statusCell = row.querySelector("div[class*='BookingListView__state']")
                        const status = statusCell ? (statusCell as HTMLElement).innerText.trim() : 'Unknown'

                        if (status !== '신청' && status !== '확정') return

                        // Date
                        const dateCell = row.querySelector("div[class*='BookingListView__book-date']")
                        const dateStr = dateCell ? (dateCell as HTMLElement).innerText.trim() : ''

                        // Product
                        const productCell = row.querySelector("div[class*='BookingListView__host']")
                        const product = productCell ? (productCell as HTMLElement).innerText.trim() : ''

                        // Option
                        const optionCell = row.querySelector("div[class*='BookingListView__option']")
                        const option = optionCell ? (optionCell as HTMLElement).innerText.trim() : ''

                        // Request
                        const requestCell = row.querySelector("div[class*='BookingListView__comment']")
                        const request = requestCell ? (requestCell as HTMLElement).innerText.trim() : ''

                        // Phone
                        const phoneCell = row.querySelector("div[class*='BookingListView__phone']")
                        const phone = phoneCell ? (phoneCell as HTMLElement).innerText.trim() : ''

                        // Duration Logic
                        let durationMin = 30
                        if (product.includes('2종 시간제') || product.includes('1시간') || product.includes('체험권')) {
                            durationMin = 60
                        } else if (request.includes('리뷰노트')) {
                            durationMin = 60
                        }

                        results.push({
                            source: 'Naver',
                            name: name,
                            status: status,
                            dateStr: dateStr,
                            product: product,
                            option: option,
                            request: request,
                            phone: phone,
                            durationMin: durationMin
                        })
                    } catch (e) { }
                })
                return results
            })

            console.log(`[ScraperService] Found ${bookings.length} bookings`)
            return bookings

        } catch (e) {
            console.error('[ScraperService] Error getting Naver bookings:', e)
            return []
        }
    }

    async getKakaoBookings(): Promise<any[]> {
        console.log('[ScraperService] getKakaoBookings called')
        try {
            if (!this.browser) {
                this.browser = await chromium.launch({ headless: false })
                this.page = await this.browser.newPage()
            }
            if (!this.page) return []

            const page = this.page
            await page.goto('https://business.kakao.com/_hxlxnIs/chats', { waitUntil: 'domcontentloaded' })

            if (page.url().includes('login')) {
                console.error('[ScraperService] Login required for Kakao')
                return []
            }

            try {
                await page.waitForSelector("li", { timeout: 10000 })
            } catch (e) {
                return []
            }

            const chats = await page.evaluate(() => {
                const results: any[] = []
                const items = document.querySelectorAll("li")

                items.forEach((item: any) => {
                    const text = item.innerText
                    if (text.length > 10 && text.includes('\n')) {
                        results.push({
                            source: 'Kakao',
                            raw_data: text.replace(/\n/g, ' ').substring(0, 50) + '...',
                            name: text.split('\n')[0] || 'Unknown', // Guessing name is first line
                            dateStr: 'Recent'
                        })
                    }
                })
                return results
            })

            return chats

        } catch (e) {
            console.error('[ScraperService] Error getting Kakao bookings:', e)
            return []
        }
    }
}
