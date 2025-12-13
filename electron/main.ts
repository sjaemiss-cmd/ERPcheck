import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import { ErpService } from './services/ErpService'
import { ScraperService } from './services/scraperService'

let mainWindow: BrowserWindow | null = null
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
        mainWindow.webContents.openDevTools()
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

// Scraper IPC handlers
ipcMain.handle('scraper:naverLogin', async () => {
    return await scraperService.naverLogin()
})

ipcMain.handle('scraper:kakaoLogin', async () => {
    return await scraperService.kakaoLogin()
})

ipcMain.handle('scraper:getNaverBookings', async () => {
    return await scraperService.getNaverBookings()
})

ipcMain.handle('scraper:getKakaoBookings', async () => {
    return await scraperService.getKakaoBookings()
})
