import { contextBridge, ipcRenderer } from 'electron'

// Rule #1: Security & IPC
// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('ipcRenderer', {
    on(...args: Parameters<typeof ipcRenderer.on>) {
        const [channel, listener] = args
        return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
    },
    off(...args: Parameters<typeof ipcRenderer.off>) {
        const [channel, ...omit] = args
        return ipcRenderer.off(channel, ...omit)
    },
    send(...args: Parameters<typeof ipcRenderer.send>) {
        const [channel, ...omit] = args
        return ipcRenderer.send(channel, ...omit)
    },
    invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
        const [channel, ...omit] = args
        return ipcRenderer.invoke(channel, ...omit)
    },
})

// Expose API for ERP Service
contextBridge.exposeInMainWorld('api', {
    erp: {
        login: (credentials: any) => ipcRenderer.invoke('erp:login', credentials),
        getSchedule: (weeks: number) => ipcRenderer.invoke('erp:getSchedule', { weeks }),
        createReservation: (data: any) => ipcRenderer.invoke('erp:createReservation', { data }),
        getTodayEducation: () => ipcRenderer.invoke('erp:getTodayEducation'),
        getStudentDetail: (id: string) => ipcRenderer.invoke('erp:getStudentDetail', { id }),
        updateMemo: (id: string, memo: string, name: string, time: string, date?: string) => ipcRenderer.invoke('erp:updateMemo', { id, memo, name, time, date }),
        writeMemosBatch: (memoList: { index: number; text: string; id: string; name: string; time: string; date?: string }[]) =>
            ipcRenderer.invoke('erp:writeMemosBatch', { memoList }),
        deleteHistory: (id: string, history: any) => ipcRenderer.invoke('erp:deleteHistory', { id, history }),
        updateHistory: (id: string, oldHistory: any, newHistory: any) => ipcRenderer.invoke('erp:updateHistory', { id, oldHistory, newHistory }),
        setHeadless: (headless: boolean) => ipcRenderer.invoke('erp:setHeadless', { headless }),
        fetchMembers: (options?: { months: number }) => ipcRenderer.invoke('erp:fetchMembers', options),
        registerToErp: (naverData: any) => ipcRenderer.invoke('erp:registerToErp', naverData),
        syncNaver: (dryRun: boolean) => ipcRenderer.invoke('erp:syncNaver', { dryRun }),
    },
    member: {
        list: () => ipcRenderer.invoke('member:list'),
        save: (members: any[]) => ipcRenderer.invoke('member:save', members),
    },
    scraper: {
        naverLogin: () => ipcRenderer.invoke('scraper:naverLogin'),
        kakaoLogin: () => ipcRenderer.invoke('scraper:kakaoLogin'),
        getNaverBookings: () => ipcRenderer.invoke('scraper:getNaverBookings'),
        getKakaoBookings: () => ipcRenderer.invoke('scraper:getKakaoBookings'),
    },
    settings: {
        saveCredentials: (creds: any) => ipcRenderer.invoke('settings:saveCredentials', creds),
        getCredentials: () => ipcRenderer.invoke('settings:getCredentials'),
    }
})
