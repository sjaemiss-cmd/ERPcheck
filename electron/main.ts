import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import dotenv from 'dotenv'
import { ErpService } from './services/ErpService'
import { ScraperService } from './services/scraperService'
import { SignatureService } from './services/SignatureService'
import Store from 'electron-store'
import { Logger } from './utils/logger'
import { normalizePhone } from './utils/phone'

dotenv.config()

let mainWindow: BrowserWindow | null = null
export const store = new Store()
const erpService = new ErpService({ registerIpcHandlers: true })
const scraperService = new ScraperService()
const signatureService = new SignatureService()

console.log('Services initialized:', erpService, scraperService)

function getWeekRangeYmd(baseDate: Date) {
    const base = new Date(baseDate)
    base.setHours(0, 0, 0, 0)

    const dayOfWeek = base.getDay() // 0=Sun..6=Sat
    const weekStartsOn = 1 // Mon
    const diff = (dayOfWeek - weekStartsOn + 7) % 7

    const start = new Date(base)
    start.setDate(start.getDate() - diff)

    const end = new Date(start)
    end.setDate(end.getDate() + 6)

    const fmt = (d: Date) => {
        const y = d.getFullYear()
        const m = String(d.getMonth() + 1).padStart(2, '0')
        const dd = String(d.getDate()).padStart(2, '0')
        return `${y}-${m}-${dd}`
    }

    return { startDate: fmt(start), endDate: fmt(end) }
}

async function runWeeklyVerificationAndExit() {
    const erpId = process.env.ERP_ID || process.env.ERP_ID_ || ''
    const erpPassword = process.env.ERP_PASSWORD || process.env.ERP_PASSWORD_ || ''

    if (!erpId || !erpPassword) {
        console.error('[Verify] Missing ERP credentials (env)')
        console.error('[Verify] Provide ERP_ID and ERP_PASSWORD env vars')
        app.exit(2)
        return
    }

    const loginOk = await erpService.login(erpId, erpPassword)
    if (!loginOk) {
        console.error('[Verify] ERP login failed')
        app.exit(3)
        return
    }

    const { startDate, endDate } = getWeekRangeYmd(new Date())

    const res = await erpService.getWeeklyReservationDetails(startDate, endDate, { refresh: true })
    const total = res.items.length
    const nullCount = res.items.filter(i => !i.resourceId).length
    const unassignedCount = res.items.filter(i => i.resourceId === 'unassigned').length
    const dobongCount = res.items.filter(i => typeof i.resourceId === 'string' && /^dobong-\d+$/.test(i.resourceId)).length
    const distinctResourceIds = Array.from(new Set(res.items.map(i => i.resourceId ?? null)))
        .sort((a, b) => String(a).localeCompare(String(b)))

    const problematic = res.items.filter(i => !i.resourceId || i.resourceId === 'unassigned' || !/^dobong-\d+$/.test(i.resourceId))

    console.log(JSON.stringify({
        startDate,
        endDate,
        fetchedAt: res.fetchedAt,
        total,
        dobongCount,
        nullCount,
        unassignedCount,
        distinctResourceIds,
        problematicSample: problematic.slice(0, 10).map(i => ({
            id: i.id,
            date: i.date,
            startTime: i.startTime,
            title: i.title,
            resourceId: i.resourceId,
        })),
    }, null, 2))

    const dumpTarget = problematic[0] ?? res.items[0]
    if (dumpTarget) {
        try {
            const dump = await erpService.dumpBookingInfo(String(dumpTarget.id))
            console.log(JSON.stringify({
                bookingInfoDump: {
                    id: String(dumpTarget.id),
                    filePath: dump.filePath,
                    parsedResourceId: dump.parsedResourceId,
                    selects: dump.selects,
                },
            }, null, 2))
        } catch (e) {
            console.error('[Verify] dumpBookingInfo failed', e)
        }
    }

    app.exit(0)
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false
        }
    })

    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        mainWindow.loadURL('http://localhost:5173')
        mainWindow.webContents.openDevTools()
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
        mainWindow.webContents.openDevTools()
    }
}

app.whenReady().then(async () => {
    if (process.argv.includes('--verify-weekly')) {
        await runWeeklyVerificationAndExit()
        return
    }

    createWindow()
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow()
    }
})

// Member Management Persistance
ipcMain.handle('member:list', () => {
    return store.get('members', [])
})

ipcMain.handle('member:save', (_, members) => {
    store.set('members', members)
    return true
})

// Settings
ipcMain.handle('settings:getCredentials', () => {
    return {
        id: store.get('erp.id', '') as string,
        password: store.get('erp.password', '') as string
    }
})

ipcMain.handle('settings:saveCredentials', (_, { id, password }) => {
    store.set('erp.id', id)
    store.set('erp.password', password)
    return true
})

ipcMain.removeHandler('erp:login')
ipcMain.handle('erp:login', async (_event, credentials) => {
    const id = credentials?.id || process.env.ERP_ID || process.env.ERP_ID_ || ''
    const password = credentials?.password || process.env.ERP_PASSWORD || process.env.ERP_PASSWORD_ || ''

    if (!id || !password) {
        console.error('Login failed: No credentials provided or env missing.')
        return false
    }

    return await erpService.login(id, password)
})

// Scraper IPC handlers
ipcMain.removeHandler('scraper:naverLogin')
ipcMain.handle('scraper:naverLogin', async () => {
    return await scraperService.naverLogin()
})

ipcMain.removeHandler('scraper:kakaoLogin')
ipcMain.handle('scraper:kakaoLogin', async () => {
    return await scraperService.kakaoLogin()
})

ipcMain.removeHandler('scraper:getNaverBookings')
ipcMain.handle('scraper:getNaverBookings', async () => {
    return await scraperService.scrapeNaverReservations()
})

ipcMain.removeHandler('scraper:getKakaoBookings')
ipcMain.handle('scraper:getKakaoBookings', async () => {
    return await scraperService.getKakaoBookings()
})

// ERP Create Reservation Wrapper (To Inject Credentials)
ipcMain.removeHandler('erp:createReservation')
ipcMain.handle('erp:createReservation', async (_event, data) => {
    // ... existing wrapper logic ...
    return await erpService.createReservation(data.data) // Fixed: unpack data structure properly
})

ipcMain.handle('erp:registerToErp', async (_event, naverData) => {
    return await erpService.registerToErp(naverData)
})

ipcMain.handle('erp:syncNaver', async () => {
    const syncTimer = Logger.startTimer('erp:syncNaver')
    console.log('[Main] Starting Naver Sync')

    // 0. Ensure ERP Login once (avoid per-item redirects)
    const id = store.get('erp.id', '') as string
    const password = store.get('erp.password', '') as string
    if (!id || !password) {
        Logger.error('[Main] ERP credentials missing for syncNaver')
        return []
    }

    const loginOk = await erpService.login(id, password)
    if (!loginOk) {
        Logger.error('[Main] ERP login failed for syncNaver')
        return []
    }

    // 1. Scrape
    const scrapeTimer = Logger.startTimer('scraper:naver scrapeNaverReservations')
    const bookings = await scraperService.scrapeNaverReservations()
    Logger.endTimer('scraper:naver scrapeNaverReservations', scrapeTimer, { count: bookings.length })

    // 2. Fetch ERP events with phone for duplicate detection
    const today = new Date()
    const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000)
    const sDate = today.toISOString().split('T')[0]
    const eDate = twoWeeksLater.toISOString().split('T')[0]

    let erpPhoneMap = new Map<string, Array<{ date: string; startTime: string | null; endTime: string | null }>>()
    try {
        const erpResult = await erpService.getWeeklyReservationDetails(sDate, eDate)
        for (const item of erpResult.items) {
            const np = normalizePhone(item.phone)
            if (np) {
                if (!erpPhoneMap.has(np)) erpPhoneMap.set(np, [])
                erpPhoneMap.get(np)!.push({ date: item.date, startTime: item.startTime, endTime: item.endTime })
            }
        }
        Logger.info('[Main] syncNaver ERP phone map built', { entries: erpPhoneMap.size, erpItems: erpResult.items.length })
    } catch (err) {
        Logger.warn('[Main] syncNaver failed to build ERP phone map, proceeding without dedup', { err })
    }

    const results: Array<{ name: string; phone?: string; date?: string; startTime?: string; status: 'Success' | 'Failed' | 'Skipped'; ms: number }> = []

    // Helper: parse date/time from naver booking date_string
    const parseNaverDate = (dateString: string): string | null => {
        const m = dateString.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/)
        return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null
    }
    const parseNaverTime = (dateString: string): string | null => {
        const timeMatch = dateString.match(/([오전후]+)\s*(\d{1,2}):(\d{2})/)
        if (!timeMatch) return null
        const [, ampm, hStr, mStr] = timeMatch
        let h = parseInt(hStr)
        if (ampm === '오후' && h < 12) h += 12
        if (ampm === '오전' && h === 12) h = 0
        return `${String(h).padStart(2, '0')}:${mStr}`
    }

    // 3. Register (with duplicate skip)
    for (const booking of bookings) {
        const bookingPhone = normalizePhone(booking.user_phone)
        const bookingDate = parseNaverDate(booking.date_string || '')
        const bookingTime = parseNaverTime(booking.date_string || '')

        if (bookingPhone && bookingDate && erpPhoneMap.has(bookingPhone)) {
            const matches = erpPhoneMap.get(bookingPhone)!
            const alreadyRegistered = matches.some(e => e.date === bookingDate)
            if (alreadyRegistered) {
                Logger.info('[Main] syncNaver SKIP (already registered)', {
                    name: booking.user_name,
                    phone: bookingPhone,
                    date: bookingDate,
                })
                results.push({
                    name: booking.user_name,
                    phone: bookingPhone ?? undefined,
                    date: bookingDate ?? undefined,
                    startTime: bookingTime ?? undefined,
                    status: 'Skipped',
                    ms: 0,
                })
                continue
            }
        }

        const oneTimer = Date.now()
        const success = await erpService.registerToErp(booking)
        const elapsedMs = Date.now() - oneTimer

        results.push({
            name: booking.user_name,
            phone: bookingPhone ?? undefined,
            date: bookingDate ?? undefined,
            startTime: bookingTime ?? undefined,
            status: success ? 'Success' : 'Failed',
            ms: elapsedMs,
        })

        Logger.info('[Main] syncNaver item', {
            name: booking.user_name,
            ok: success,
            ms: elapsedMs,
        })
    }

    Logger.endTimer('erp:syncNaver', syncTimer, { count: results.length })
    return results
})

// Signature IPC handlers
ipcMain.handle('signature:getActiveForms', () => signatureService.getActiveForms())
ipcMain.handle('signature:getAllForms', () => signatureService.getAllForms())
ipcMain.handle('signature:getFormById', (_, { id }) => signatureService.getFormById(id))
ipcMain.handle('signature:createForm', (_, { title, content }) => signatureService.createForm(title, content))
ipcMain.handle('signature:updateForm', (_, { id, title, content }) => signatureService.updateForm(id, title, content))
ipcMain.handle('signature:toggleFormActive', (_, { id }) => signatureService.toggleFormActive(id))
ipcMain.handle('signature:deleteForm', (_, { id }) => signatureService.deleteForm(id))
ipcMain.handle('signature:submit', (_, data) => signatureService.submitSignature(data))
ipcMain.handle('signature:getById', (_, { id }) => signatureService.getSignatureById(id))
ipcMain.handle('signature:search', (_, params) => signatureService.searchSignatures(params))
ipcMain.handle('signature:delete', (_, { id }) => signatureService.deleteSignature(id))
ipcMain.handle('signature:getStats', () => signatureService.getStats())
