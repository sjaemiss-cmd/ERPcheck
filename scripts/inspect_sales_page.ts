import { chromium } from 'playwright'

async function run() {
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    console.log('Logging in...')
    await page.goto('http://sook0517.cafe24.com/')
    await page.fill("input[name='id']", 'dobong')
    await page.fill("input[name='pwd']", '1010')
    await page.click("button.btn-primary, button[type='submit']")
    await page.waitForLoadState('domcontentloaded')

    console.log('Navigating to Sales View...')
    await page.goto('http://sook0517.cafe24.com/index/sales_view')

    console.log('Page Title:', await page.title())

    // Dump inputs
    const inputs = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('input, select')).map(el => ({
            tagName: el.tagName,
            name: (el as any).name,
            id: el.id,
            type: (el as any).type,
            value: (el as any).value
        }))
    })
    console.log('Inputs:', JSON.stringify(inputs, null, 2))

    // Dump table headers
    const headers = await page.evaluate(() => {
        const ths = Array.from(document.querySelectorAll('table th'))
        return ths.map(th => th.innerText.trim())
    })
    console.log('Table Headers:', headers)

    await browser.close()
}

run().catch(console.error)
