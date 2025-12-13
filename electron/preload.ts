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
        updateMemo: (id: string, memo: string, name: string, time: string) => ipcRenderer.invoke('erp:updateMemo', { id, memo, name, time }),
        writeMemosBatch: (memoList: { index: number; text: string; name: string; time: string }[]) =>
            ipcRenderer.invoke('erp:writeMemosBatch', { memoList }),
    },
    scraper: {
        naverLogin: () => ipcRenderer.invoke('scraper:naverLogin'),
        getNaverReservations: () => ipcRenderer.invoke('scraper:getNaverReservations'),
    }
})
