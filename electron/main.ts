import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { ErpService } from './services/ErpService'
import { ScraperService } from './services/scraperService'
import Store from 'electron-store'

let mainWindow: BrowserWindow | null = null
const store = new Store()
const erpService = new ErpService()
const scraperService = new ScraperService()

console.log('Services initialized:', erpService, scraperService)

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
        // mainWindow.webContents.openDevTools()
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }
}

app.whenReady().then(createWindow)

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

// Settings
ipcMain.removeHandler('settings:saveCredentials')
ipcMain.handle('settings:saveCredentials', (_event, creds) => {
    store.set('erp.id', creds.id)
    store.set('erp.password', creds.password)
    return true
    return true
})

// Member Management Persistance
ipcMain.handle('member:list', () => {
    return store.get('members', [])
})

ipcMain.handle('member:save', (_, members) => {
    store.set('members', members)
    return true
})

ipcMain.removeHandler('settings:getCredentials')
ipcMain.handle('settings:getCredentials', () => {
    return {
        id: store.get('erp.id', ''),
        password: store.get('erp.password', '')
    }
})

// ERP Login with Store fallback
ipcMain.removeHandler('erp:login')
ipcMain.handle('erp:login', async (_event, credentials) => {
    let { id, password } = credentials || {};

    // Fallback to store
    if (!id || !password) {
        id = store.get('erp.id') as string;
        password = store.get('erp.password') as string;
    }

    if (!id || !password) {
        console.error('Login failed: No credentials provided or stored.')
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

ipcMain.handle('erp:syncNaver', async (_event, { dryRun }) => {
    console.log(`[Main] Starting Naver Sync (DryRun: ${dryRun})`);

    // 1. Scrape
    const bookings = await scraperService.scrapeNaverReservations();
    console.log(`[Main] Scraped ${bookings.length} bookings`);

    const results = [];
    for (const booking of bookings) {
        // 2. Register (Sync)
        const success = await erpService.registerToErp(booking, dryRun);
        results.push({
            name: booking.user_name,
            status: success ? 'Success' : 'Failed',
            dryRun: dryRun
        });

        // Brief pause to fail safely
        await new Promise(r => setTimeout(r, 1000));
    }

    return results;
})
