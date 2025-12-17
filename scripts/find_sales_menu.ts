import { chromium } from 'playwright'

async function run() {
    console.log('Launching browser...')
    const browser = await chromium.launch({ headless: true })
    const page = await browser.newPage()

    console.log('Navigating to login...')
    await page.goto('http://sook0517.cafe24.com/')

    console.log('Filling credentials...')
    try {
        await page.fill("input[name='id']", 'dobong', { timeout: 5000 })
        await page.fill("input[name='pwd']", '1010')

        console.log('Clicking login...')
        await page.click("button.btn-primary, button[type='submit']")
        await page.waitForLoadState('domcontentloaded')
    } catch (e) {
        console.log('Login step failed or already logged in/redirected', e)
    }

    console.log('Logged in. Current URL:', page.url())

    console.log('Extracting menu links...')
    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a')).map(a => ({
            text: a.innerText.trim(),
            href: a.href
        }))
    })

    const candidates = links.filter(l =>
        l.text.includes('매출') ||
        l.text.includes('통계') ||
        l.text.includes('결산') ||
        l.text.includes('장부') ||
        l.text.includes('Sales')
    )

    console.log('Found candidates:', JSON.stringify(candidates, null, 2))

    await browser.close()
}

run().catch(console.error)
