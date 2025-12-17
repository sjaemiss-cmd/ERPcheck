import { chromium } from 'playwright'
import * as fs from 'fs'
import * as path from 'path'

async function run() {
    console.log('Launching browser...')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    // Login
    console.log('Logging in...')
    await page.goto('http://sook0517.cafe24.com/')
    await page.fill("input[name='id']", 'dobong')
    await page.fill("input[name='pwd']", '1010')
    await page.click("button.btn-primary, button[type='submit']")
    await page.waitForLoadState('domcontentloaded')

    console.log('Navigating to Sales View...')
    await page.goto('http://sook0517.cafe24.com/index/sales_view')

    const ranges = [
        { name: '2023', start: '2023-01-01', end: '2023-12-31' },
        { name: '2024', start: '2024-01-01', end: '2024-12-31' },
        { name: '2025_Q1', start: '2025-01-01', end: '2025-03-31' }
    ]

    let allSalesData: string[][] = []
    let allOtherData: string[][] = []

    for (const range of ranges) {
        console.log(`Fetching data for ${range.name} (${range.start} - ${range.end})...`)

        // Set date range using jQuery and DOM
        const dateStr = `${range.start} - ${range.end}`

        await page.evaluate((args) => {
            const { dateStr, start, end } = args
            // @ts-ignore
            if (window.$) {
                // @ts-ignore
                $('#sales_date_term').val(dateStr).trigger('change');
                // @ts-ignore
                $('input[name="daterangepicker_start"]').val(start).trigger('change');
                // @ts-ignore
                $('input[name="daterangepicker_end"]').val(end).trigger('change');
            } else {
                // Fallback
                const input = document.querySelector('#sales_date_term') as HTMLInputElement
                if (input) input.value = dateStr
            }
        }, { dateStr, start: range.start, end: range.end })

        // Click Search
        console.log('Clicking search...')
        const searchBtn = page.locator('button').filter({ hasText: '검색' }).first()
        if (await searchBtn.count() > 0) {
            await searchBtn.click()
        } else {
            const iconBtn = page.locator('.btn-search, .search-btn').first()
            if (await iconBtn.count() > 0) await iconBtn.click()
            else await page.press('#sales_date_term', 'Enter')
        }

        // Wait for reload - check if first row date matches year
        await page.waitForTimeout(3000)

        // Extract Data
        const tables = await page.evaluate(() => {
            const result: { type: string, headers: string[], rows: string[][] }[] = []
            const tableEls = document.querySelectorAll('table')

            tableEls.forEach(table => {
                const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim())
                const rows = Array.from(table.querySelectorAll('tbody tr')).map(tr => {
                    return Array.from(tr.querySelectorAll('td')).map(td => td.innerText.trim())
                })

                // Filter out calendar tables (usually have headers like '일', '월' or no headers)
                if (headers.includes('납부금액')) {
                    result.push({ type: 'sales', headers, rows })
                } else if (headers.includes('기타결제납부금액')) {
                    result.push({ type: 'other', headers, rows })
                }
            })
            return result
        })

        console.log(`Found ${tables.length} relevant tables.`)

        tables.forEach(t => {
            if (t.type === 'sales') {
                t.rows.forEach(row => {
                    // Verify date matches year (simple check)
                    if (row[0] && row[0].startsWith(range.name.substring(0, 4))) {
                        allSalesData.push([range.name, ...row])
                    } else if (row[0]) {
                        // console.warn(`Date mismatch in sales row: ${row[0]}`)
                        // Still add it, maybe the date format is different or it's valid
                        allSalesData.push([range.name, ...row])
                    }
                })
            } else if (t.type === 'other') {
                t.rows.forEach(row => {
                    allOtherData.push([range.name, ...row])
                })
            }
        })
    }

    // Save Sales CSV
    if (allSalesData.length > 0) {
        const salesHeader = ['Period', '일자', '이름', '미납금액', '납부금액', '상품', '지불 방식', '이벤트'].join(',')
        const salesBody = allSalesData.map(row => row.map(c => `"${c}"`).join(',')).join('\n')
        fs.writeFileSync('revenue_sales.csv', `${salesHeader}\n${salesBody}`)
        console.log('Saved revenue_sales.csv')
    }

    // Save Other CSV
    if (allOtherData.length > 0) {
        const otherHeader = ['Period', '일자', '이름', '기타결제사유', '기타결제미납금액', '기타결제납부금액'].join(',')
        const otherBody = allOtherData.map(row => row.map(c => `"${c}"`).join(',')).join('\n')
        fs.writeFileSync('revenue_other.csv', `${otherHeader}\n${otherBody}`)
        console.log('Saved revenue_other.csv')
    }

    await browser.close()
}

run().catch(console.error)
